import { useState, useEffect, useRef, useCallback } from 'react';

export interface CaptureProps {
  nodeId: string;
  sessionToken: string;
  serverUrl: string;
  syncTs: number;
  duration?: number; // seconds, default 10
}

type CaptureState =
  | 'waiting'      // Waiting for syncTs to arrive
  | 'recording'    // MediaRecorder active
  | 'uploading'    // Uploading the recorded blob
  | 'success'      // Upload complete
  | 'error';       // Camera unavailable or upload failed

/**
 * Capture component — waits until the synchronized start time, records video
 * using MediaRecorder, then uploads the blob with retry logic.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 13.2
 */
export function Capture({
  nodeId,
  sessionToken,
  serverUrl,
  syncTs,
  duration = 10,
}: CaptureProps) {
  const [state, setState] = useState<CaptureState>('waiting');
  const [countdown, setCountdown] = useState<number>(duration);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [waitSeconds, setWaitSeconds] = useState<number>(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopRecording();
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  /**
   * Upload recorded blob with retry logic: 3 attempts, exponential backoff (1s, 2s, 4s).
   */
  const uploadBlob = useCallback(
    async (blob: Blob): Promise<boolean> => {
      const maxAttempts = 3;
      const baseMs = 1000;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const formData = new FormData();
          formData.append('video', blob, `${nodeId}.webm`);

          const xhr = new XMLHttpRequest();
          const uploadUrl = `${serverUrl}/upload/${encodeURIComponent(nodeId)}`;

          const success = await new Promise<boolean>((resolve) => {
            xhr.open('POST', uploadUrl);
            xhr.setRequestHeader('X-Session-Token', sessionToken);

            xhr.upload.onprogress = (event) => {
              if (event.lengthComputable && mountedRef.current) {
                setUploadProgress(Math.round((event.loaded / event.total) * 100));
              }
            };

            xhr.onload = () => {
              resolve(xhr.status >= 200 && xhr.status < 300);
            };

            xhr.onerror = () => {
              resolve(false);
            };

            xhr.ontimeout = () => {
              resolve(false);
            };

            xhr.send(formData);
          });

          if (success) {
            return true;
          }
        } catch {
          // Fall through to retry
        }

        // Wait with exponential backoff before retrying (1s, 2s, 4s)
        if (attempt < maxAttempts - 1) {
          const delay = baseMs * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
          if (mountedRef.current) {
            setUploadProgress(0);
          }
        }
      }

      return false;
    },
    [nodeId, sessionToken, serverUrl]
  );

  /**
   * Start the recording process: request camera, start MediaRecorder,
   * record for `duration` seconds, then upload.
   */
  const startRecording = useCallback(async () => {
    // Request camera with 480p max constraint
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640, max: 854 },
          height: { ideal: 480, max: 480 },
          facingMode: 'environment',
        },
        audio: false,
      });
    } catch {
      // Camera unavailable: report failure, skip upload (Req 6.5)
      if (mountedRef.current) {
        setState('error');
        setErrorMessage('Camera unavailable. Capture skipped.');
      }
      return;
    }

    if (!mountedRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];

    // Determine supported codec
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
      ? 'video/webm;codecs=vp8'
      : 'video/webm';

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType });
    } catch {
      // MediaRecorder unavailable
      if (mountedRef.current) {
        setState('error');
        setErrorMessage('MediaRecorder not supported. Capture skipped.');
      }
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onstop = async () => {
      stopRecording();

      if (!mountedRef.current) return;

      const blob = new Blob(chunksRef.current, { type: mimeType });

      if (blob.size === 0) {
        setState('error');
        setErrorMessage('Recording produced empty data.');
        return;
      }

      // Upload the blob
      setState('uploading');
      const success = await uploadBlob(blob);

      if (!mountedRef.current) return;

      if (success) {
        setState('success');
      } else {
        setState('error');
        setErrorMessage('Upload failed after 3 attempts.');
      }
    };

    // Start recording
    setState('recording');
    setCountdown(duration);
    recorder.start(1000); // Collect data every second

    // Countdown timer
    let remaining = duration;
    countdownIntervalRef.current = setInterval(() => {
      remaining -= 1;
      if (mountedRef.current) {
        setCountdown(remaining);
      }
      if (remaining <= 0) {
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      }
    }, 1000);
  }, [duration, stopRecording, uploadBlob]);

  // Wait for syncTs then start recording
  useEffect(() => {
    const now = Date.now();
    const delay = syncTs - now;

    if (delay <= 0) {
      // syncTs already passed, start immediately
      startRecording();
    } else {
      // Update wait countdown
      setWaitSeconds(Math.ceil(delay / 1000));
      const waitInterval = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((syncTs - Date.now()) / 1000));
        if (mountedRef.current) {
          setWaitSeconds(remaining);
        }
        if (remaining <= 0) {
          clearInterval(waitInterval);
        }
      }, 500);

      const timer = setTimeout(() => {
        if (mountedRef.current) {
          startRecording();
        }
      }, delay);

      return () => {
        clearTimeout(timer);
        clearInterval(waitInterval);
      };
    }
  }, [syncTs, startRecording]);

  // Render based on state
  if (state === 'error') {
    return (
      <div style={styles.container}>
        <div style={styles.iconError}>✕</div>
        <p style={styles.errorText}>{errorMessage}</p>
      </div>
    );
  }

  if (state === 'success') {
    return (
      <div style={styles.container}>
        <div style={styles.iconSuccess}>✓</div>
        <p style={styles.successText}>Upload complete</p>
      </div>
    );
  }

  if (state === 'uploading') {
    return (
      <div style={styles.container}>
        <p style={styles.labelText}>Uploading...</p>
        <div style={styles.progressBar}>
          <div
            style={{
              ...styles.progressFill,
              width: `${uploadProgress}%`,
            }}
          />
        </div>
        <p style={styles.progressText}>{uploadProgress}%</p>
      </div>
    );
  }

  if (state === 'recording') {
    return (
      <div style={styles.container}>
        <div style={styles.recordingDot} />
        <p style={styles.countdownText}>{countdown}s</p>
        <p style={styles.labelText}>Recording...</p>
      </div>
    );
  }

  // Waiting state
  return (
    <div style={styles.container}>
      <p style={styles.labelText}>Starting in</p>
      <p style={styles.countdownText}>{waitSeconds}s</p>
      <p style={styles.sublabelText}>Synchronizing with swarm</p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    backgroundColor: '#050D1A',
    color: '#FFFFFF',
    fontFamily: 'monospace',
    padding: '1rem',
  },
  labelText: {
    fontSize: '1rem',
    color: '#00BFFF',
    marginBottom: '0.5rem',
  },
  sublabelText: {
    fontSize: '0.75rem',
    color: '#888888',
    marginTop: '0.5rem',
  },
  countdownText: {
    fontSize: '3rem',
    fontWeight: 'bold',
    color: '#00FF9C',
    margin: '0.5rem 0',
  },
  recordingDot: {
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    backgroundColor: '#FF4444',
    marginBottom: '1rem',
    animation: 'pulse 1s infinite',
  },
  progressBar: {
    width: '80%',
    maxWidth: '300px',
    height: '8px',
    backgroundColor: '#1A2A3A',
    borderRadius: '4px',
    overflow: 'hidden',
    margin: '1rem 0',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#00FF9C',
    borderRadius: '4px',
    transition: 'width 0.3s ease',
  },
  progressText: {
    fontSize: '0.875rem',
    color: '#00FF9C',
  },
  iconSuccess: {
    fontSize: '3rem',
    color: '#00FF9C',
    marginBottom: '1rem',
  },
  iconError: {
    fontSize: '3rem',
    color: '#FF4444',
    marginBottom: '1rem',
  },
  successText: {
    fontSize: '1rem',
    color: '#00FF9C',
  },
  errorText: {
    fontSize: '1rem',
    color: '#FF4444',
    textAlign: 'center',
  },
};

export default Capture;
