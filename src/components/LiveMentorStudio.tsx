import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  CameraOff,
  Check,
  Copy,
  Loader2,
  MessageSquarePlus,
  Mic,
  MicOff,
  PhoneOff,
  Send,
  Sparkles,
  Video,
  Volume2,
} from 'lucide-react';
import { toast } from 'sonner';
import { getActiveAuthToken, hasActiveAuthSession } from '../lib/localAuthSession';
import { Button, Surface } from './ui/Primitives';

export const SUPPORTED_LANGUAGES = [
  'Auto-Detect',
  'English',
  'Hindi (हिन्दी)',
  'Telugu (తెలుగు)',
  'Tamil (தமிழ்)',
  'Kannada (ಕನ್ನಡ)',
  'Malayalam (മലയാളം)',
  'Bengali (বাংলা)',
  'Marathi (मराठी)',
  'Spanish (Español)',
  'French (Français)',
  'German (Deutsch)',
  'Japanese (日本語)',
];

export const GEMINI_VOICES = [
  { id: 'Zephyr', label: 'Zephyr (Warm & Clear)' },
  { id: 'Kore', label: 'Kore (Crisp Mentor)' },
  { id: 'Puck', label: 'Puck (Energetic)' },
  { id: 'Charon', label: 'Charon (Deep & Calm)' },
  { id: 'Fenrir', label: 'Fenrir (Direct Coach)' },
];

export type CoachingSessionMode = 'mentor' | 'interview' | 'project' | 'communication';

const COACHING_MODES: Array<{
  id: CoachingSessionMode;
  label: string;
  description: string;
  quickStarter: string;
}> = [
  {
    id: 'mentor',
    label: 'Career Mentor',
    description: 'Open face-to-face career, skill gap & study guidance',
    quickStarter: 'What should I focus on today based on my target role and skill gaps?',
  },
  {
    id: 'interview',
    label: 'Mock Interview',
    description: 'Live technical & behavioral interview with real-time feedback',
    quickStarter: 'Start a realistic 3-question mock interview for my target role.',
  },
  {
    id: 'project',
    label: 'Project Defense',
    description: 'Walk through projects, code architecture, or hold notes up to camera',
    quickStarter: 'Ask me tough hiring-manager questions about my projects and technical decisions.',
  },
  {
    id: 'communication',
    label: 'Language Coach',
    description: 'Practice fluent technical speaking in any supported language',
    quickStarter: 'Help me practice introducing myself confidently in 60 seconds.',
  },
];

export interface LiveTranscriptItem {
  id: string;
  speaker: 'you' | 'agent';
  text: string;
  timestamp: string;
}

interface LiveMentorStudioProps {
  mode: 'voice' | 'video';
  language: string;
  voiceName: string;
  userContext: Record<string, unknown>;
  onSaveToChat?: (transcriptSummary: string) => Promise<void>;
}

/**
 * Downsample arbitrary browser AudioContext sample rate (e.g., 44.1kHz or 48kHz)
 * cleanly to 16kHz mono Float32 before encoding 16-bit PCM for Gemini Live API.
 */
function downsampleTo16k(input: Float32Array, inputSampleRate: number): Float32Array {
  if (inputSampleRate === 16000) return input;
  const ratio = inputSampleRate / 16000;
  const outputLength = Math.max(1, Math.floor(input.length / ratio));
  const result = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j++) {
      sum += input[j];
      count++;
    }
    result[i] = count > 0 ? sum / count : input[start] || 0;
  }
  return result;
}

function float32ToPcm16Base64(input: Float32Array): string {
  const pcm16 = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(pcm16.buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64Pcm24ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768;
  }
  return float32;
}

function formatDuration(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatClockNow(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function LiveMentorStudio({
  mode,
  language,
  voiceName,
  userContext,
  onSaveToChat,
}: LiveMentorStudioProps) {
  const [coachingMode, setCoachingMode] = useState<CoachingSessionMode>('mentor');
  const [status, setStatus] = useState<'idle' | 'connecting' | 'live'>('idle');
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(mode === 'video');
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [agentLevel, setAgentLevel] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [transcripts, setTranscripts] = useState<LiveTranscriptItem[]>([]);
  const [liveTextInput, setLiveTextInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedTranscript, setCopiedTranscript] = useState(false);
  const [savingToChat, setSavingToChat] = useState(false);

  // Refs to avoid stale closures inside audio/video callbacks (strict Live API rule)
  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const meterRafRef = useRef<number | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameIntervalRef = useRef<number | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const micMutedRef = useRef<boolean>(false);
  const cameraOnRef = useRef<boolean>(mode === 'video');
  const lastTurnFinalizedRef = useRef<boolean>(true);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    micMutedRef.current = micMuted;
  }, [micMuted]);

  useEffect(() => {
    cameraOnRef.current = cameraOn;
  }, [cameraOn]);

  useEffect(() => {
    setCameraOn(mode === 'video');
    cameraOnRef.current = mode === 'video';
  }, [mode]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

  // Live session elapsed timer
  useEffect(() => {
    if (status !== 'live') {
      setElapsedSec(0);
      return;
    }
    const timer = window.setInterval(() => {
      setElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [status]);

  const stopVideoFrameLoop = useCallback(() => {
    if (frameIntervalRef.current) {
      window.clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
  }, []);

  const startVideoFrameLoop = useCallback(() => {
    stopVideoFrameLoop();
    // Strictly <= 1 FPS JPEG video streaming per Gemini Live API guidance
    frameIntervalRef.current = window.setInterval(() => {
      const ws = wsRef.current;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!cameraOnRef.current || !video || !canvas || !ws || ws.readyState !== WebSocket.OPEN) {
        return;
      }
      if (video.videoWidth === 0 || video.videoHeight === 0) return;
      canvas.width = 480;
      canvas.height = Math.round((video.videoHeight / video.videoWidth) * 480) || 360;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
      const base64Jpeg = dataUrl.split(',')[1];
      if (base64Jpeg) {
        ws.send(JSON.stringify({ type: 'video', data: base64Jpeg }));
      }
    }, 1000);
  }, [stopVideoFrameLoop]);

  const stopPlayback = useCallback(() => {
    for (const src of activeSourcesRef.current) {
      try {
        src.stop();
      } catch {
        // Ignore already stopped sources
      }
    }
    activeSourcesRef.current.clear();
    if (outputAudioCtxRef.current) {
      nextStartTimeRef.current = outputAudioCtxRef.current.currentTime;
    }
    setAgentSpeaking(false);
    setAgentLevel(0);
  }, []);

  const scheduleAudioChunk = useCallback((base64Pcm: string) => {
    const ctx = outputAudioCtxRef.current;
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const float32 = base64Pcm24ToFloat32(base64Pcm);
    const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
    audioBuffer.getChannelData(0).set(float32);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    if (outputAnalyserRef.current) {
      source.connect(outputAnalyserRef.current);
    } else {
      source.connect(ctx.destination);
    }

    const now = ctx.currentTime;
    const startAt = Math.max(now + 0.02, nextStartTimeRef.current);
    source.start(startAt);
    nextStartTimeRef.current = startAt + audioBuffer.duration;

    activeSourcesRef.current.add(source);
    setAgentSpeaking(true);
    source.onended = () => {
      activeSourcesRef.current.delete(source);
      if (activeSourcesRef.current.size === 0) {
        setAgentSpeaking(false);
        setAgentLevel(0);
      }
    };
  }, []);

  const stopSession = useCallback(() => {
    stopVideoFrameLoop();
    if (meterRafRef.current) {
      window.cancelAnimationFrame(meterRafRef.current);
      meterRafRef.current = null;
    }
    try {
      processorRef.current?.disconnect();
    } catch {
      // Ignore disconnect errors
    }
    processorRef.current = null;

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    stopPlayback();
    outputAnalyserRef.current = null;

    try {
      inputAudioCtxRef.current?.close();
    } catch {
      // Ignore close errors
    }
    inputAudioCtxRef.current = null;

    try {
      outputAudioCtxRef.current?.close();
    } catch {
      // Ignore close errors
    }
    outputAudioCtxRef.current = null;

    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // Ignore ws close errors
      }
      wsRef.current = null;
    }

    setStatus('idle');
    setAgentSpeaking(false);
    setMicLevel(0);
    setAgentLevel(0);
  }, [stopPlayback, stopVideoFrameLoop]);

  useEffect(() => {
    return () => {
      stopSession();
    };
  }, [stopSession]);

  const appendTranscript = useCallback((speaker: 'you' | 'agent', chunk: string) => {
    if (!chunk) return;
    setTranscripts((prev) => {
      const last = prev[prev.length - 1];
      const shouldAppendToLast =
        last && last.speaker === speaker && !lastTurnFinalizedRef.current;

      if (shouldAppendToLast) {
        // Handle streaming word/sub-word fragments gracefully without breaking punctuation
        const needsSpace =
          last.text.length > 0 &&
          !/\s$/.test(last.text) &&
          !/^[\s.,!?;:'"’)\]]/.test(chunk);
        const joined = `${last.text}${needsSpace ? ' ' : ''}${chunk}`;
        return [...prev.slice(0, -1), { ...last, text: joined }];
      }

      const trimmed = chunk.trim();
      if (!trimmed) return prev;
      lastTurnFinalizedRef.current = false;
      return [
        ...prev.slice(-40),
        {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          speaker,
          text: trimmed,
          timestamp: formatClockNow(),
        },
      ];
    });
  }, []);

  const startSession = async () => {
    setErrorMsg('');
    if (!hasActiveAuthSession()) {
      setErrorMsg('Please sign in to start a live voice or video session.');
      return;
    }

    setStatus('connecting');
    lastTurnFinalizedRef.current = true;
    try {
      const wantVideo = mode === 'video' || cameraOnRef.current;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: wantVideo
          ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
          : false,
      });
      mediaStreamRef.current = stream;

      if (wantVideo && videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      const token = await getActiveAuthToken();
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/api/live`);
      wsRef.current = ws;

      const inputCtx = new AudioContext({ sampleRate: 16000 });
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      const analyser = outputCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.connect(outputCtx.destination);
      inputAudioCtxRef.current = inputCtx;
      outputAudioCtxRef.current = outputCtx;
      outputAnalyserRef.current = analyser;
      nextStartTimeRef.current = outputCtx.currentTime;

      // Animate mentor voice presence from real 24kHz Gemini audio output
      const timeDomainData = new Uint8Array(analyser.frequencyBinCount);
      const pollAgentMeter = () => {
        if (!outputAnalyserRef.current) return;
        outputAnalyserRef.current.getByteTimeDomainData(timeDomainData);
        let sumSq = 0;
        for (let i = 0; i < timeDomainData.length; i++) {
          const norm = (timeDomainData[i] - 128) / 128;
          sumSq += norm * norm;
        }
        const rms = Math.sqrt(sumSq / timeDomainData.length);
        setAgentLevel(Math.min(1, rms * 4.5));
        meterRafRef.current = window.requestAnimationFrame(pollAgentMeter);
      };
      meterRafRef.current = window.requestAnimationFrame(pollAgentMeter);

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'init',
            token,
            language,
            voiceName,
            coachingMode,
            cameraEnabled: wantVideo,
            userContext,
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as {
            type?: string;
            data?: string;
            text?: string;
            message?: string;
          };
          if (msg.type === 'ready') {
            setStatus('live');
            toast.success(
              wantVideo
                ? 'Live Camera & Voice Mentor connected'
                : 'Live Multi-Language Voice Assistant connected'
            );

            // Start 16kHz PCM mic capture with silent gain sink (no local echo loopback)
            const source = inputCtx.createMediaStreamSource(stream);
            const processor = inputCtx.createScriptProcessor(4096, 1, 1);
            const silentSink = inputCtx.createGain();
            silentSink.gain.value = 0;
            processorRef.current = processor;
            source.connect(processor);
            processor.connect(silentSink);
            silentSink.connect(inputCtx.destination);

            processor.onaudioprocess = (e) => {
              if (micMutedRef.current || ws.readyState !== WebSocket.OPEN) {
                setMicLevel(0);
                return;
              }
              const rawChannel = e.inputBuffer.getChannelData(0);
              let sum = 0;
              for (let i = 0; i < rawChannel.length; i++) {
                sum += rawChannel[i] * rawChannel[i];
              }
              const rms = Math.sqrt(sum / rawChannel.length);
              setMicLevel(Math.min(1, rms * 7));

              const pcm16k = downsampleTo16k(rawChannel, inputCtx.sampleRate);
              const base64 = float32ToPcm16Base64(pcm16k);
              ws.send(JSON.stringify({ type: 'audio', data: base64 }));
            };

            if (wantVideo) {
              startVideoFrameLoop();
            }
          } else if (msg.type === 'audio' && msg.data) {
            scheduleAudioChunk(msg.data);
          } else if (msg.type === 'inputTranscript' && msg.text) {
            appendTranscript('you', msg.text);
          } else if (msg.type === 'outputTranscript' && msg.text) {
            appendTranscript('agent', msg.text);
          } else if (msg.type === 'turnComplete') {
            lastTurnFinalizedRef.current = true;
          } else if (msg.type === 'interrupted') {
            lastTurnFinalizedRef.current = true;
            stopPlayback();
          } else if (msg.type === 'error') {
            const m = msg.message || 'Live session error occurred.';
            setErrorMsg(m);
            toast.error(m);
            stopSession();
          } else if (msg.type === 'closed') {
            stopSession();
          }
        } catch {
          // Ignore malformed frame
        }
      };

      ws.onerror = () => {
        setErrorMsg('Could not connect to the Chokma Live voice & video bridge. Please retry.');
        stopSession();
      };

      ws.onclose = () => {
        setStatus('idle');
      };
    } catch (err) {
      const message =
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Camera or microphone permission was denied. Please allow access in your browser toolbar and try again.'
          : err instanceof Error
          ? err.message
          : 'Could not start live session.';
      setErrorMsg(message);
      toast.error(message);
      stopSession();
    }
  };

  // Supports toggling camera off/on seamlessly during a live call (even upgrading from voice-only!)
  const toggleCameraTrack = async () => {
    const next = !cameraOn;
    if (!next) {
      setCameraOn(false);
      cameraOnRef.current = false;
      mediaStreamRef.current?.getVideoTracks().forEach((t) => {
        t.enabled = false;
      });
      return;
    }

    const existingVideoTracks = mediaStreamRef.current?.getVideoTracks() || [];
    if (existingVideoTracks.length > 0) {
      existingVideoTracks.forEach((t) => {
        t.enabled = true;
      });
      setCameraOn(true);
      cameraOnRef.current = true;
      startVideoFrameLoop();
      return;
    }

    // Dynamically add webcam video track mid-session
    if (status === 'live') {
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        });
        const [videoTrack] = camStream.getVideoTracks();
        if (videoTrack && mediaStreamRef.current) {
          mediaStreamRef.current.addTrack(videoTrack);
          if (videoRef.current) {
            videoRef.current.srcObject = mediaStreamRef.current;
            await videoRef.current.play().catch(() => {});
          }
          setCameraOn(true);
          cameraOnRef.current = true;
          startVideoFrameLoop();
          toast.success('Camera enabled — Chokma Live can now see you');
        }
      } catch {
        toast.error('Could not enable camera. Check browser permissions.');
      }
    } else {
      setCameraOn(true);
      cameraOnRef.current = true;
    }
  };

  const sendMidCallText = (textOverride?: string) => {
    const text = (textOverride ?? liveTextInput).trim();
    if (!text || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    lastTurnFinalizedRef.current = true;
    wsRef.current.send(JSON.stringify({ type: 'text', text }));
    appendTranscript('you', text);
    lastTurnFinalizedRef.current = true;
    if (!textOverride) setLiveTextInput('');
  };

  const handleCopyTranscript = async () => {
    if (transcripts.length === 0) return;
    const formatted = transcripts
      .map((t) => `[${t.timestamp}] ${t.speaker === 'you' ? 'You' : 'Chokma Live'}: ${t.text}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(formatted);
      setCopiedTranscript(true);
      toast.success('Live session transcript copied');
      window.setTimeout(() => setCopiedTranscript(false), 2000);
    } catch {
      toast.error('Could not copy transcript');
    }
  };

  const handleSaveToChat = async () => {
    if (!onSaveToChat || transcripts.length === 0 || savingToChat) return;
    setSavingToChat(true);
    try {
      const condensed = transcripts
        .slice(-16)
        .map((t) => `${t.speaker === 'you' ? 'Student' : 'Mentor'}: ${t.text}`)
        .join('\n');
      await onSaveToChat(
        `Summarize key takeaways and 3 concrete next actions from my live ${
          cameraOn ? 'camera & voice' : 'voice'
        } session (${language}):\n\n${condensed}`
      );
      toast.success('Live session saved to your Text Chat history');
    } catch {
      toast.error('Could not save session to chat history');
    } finally {
      setSavingToChat(false);
    }
  };

  const activeModeMeta = COACHING_MODES.find((m) => m.id === coachingMode) || COACHING_MODES[0];
  const showCameraStage = mode === 'video' || (status === 'live' && cameraOn);
  const mentorRingScale = status === 'live' ? 1 + (agentSpeaking ? Math.max(0.08, agentLevel * 0.28) : 0) : 1;
  const userRingScale = status === 'live' && !micMuted ? 1 + micLevel * 0.22 : 1;

  // Bind MediaStream to <video> whenever the camera stage mounts (including mid-call voice -> video upgrades)
  useEffect(() => {
    if (showCameraStage && cameraOn && status === 'live' && videoRef.current && mediaStreamRef.current) {
      if (videoRef.current.srcObject !== mediaStreamRef.current) {
        videoRef.current.srcObject = mediaStreamRef.current;
        videoRef.current.play().catch(() => {});
      }
    }
  }, [showCameraStage, cameraOn, status]);

  return (
    <Surface className="overflow-hidden">
      {/* Studio Toolbar: Coaching Style Selector + Live Controls */}
      <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {COACHING_MODES.map((item) => {
            const selected = coachingMode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                disabled={status !== 'idle'}
                onClick={() => setCoachingMode(item.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer disabled:opacity-60 ${
                  selected
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {status === 'live' && (
            <span className="inline-flex items-center gap-2 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300 pr-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" aria-hidden="true" />
              Live · {formatDuration(elapsedSec)}
            </span>
          )}

          {status === 'idle' ? (
            <Button size="sm" variant="primary" onClick={startSession}>
              {mode === 'video' ? (
                <Video className="w-3.5 h-3.5" />
              ) : (
                <Mic className="w-3.5 h-3.5" />
              )}
              {mode === 'video' ? 'Start Face-to-Face Call' : 'Start Air Voice Call'}
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                variant={micMuted ? 'danger' : 'outline'}
                onClick={() => setMicMuted((m) => !m)}
              >
                {micMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                {micMuted ? 'Unmute' : 'Mute'}
              </Button>
              <Button
                size="sm"
                variant={cameraOn ? 'outline' : 'secondary'}
                onClick={() => void toggleCameraTrack()}
              >
                {cameraOn ? <Camera className="w-3.5 h-3.5" /> : <CameraOff className="w-3.5 h-3.5" />}
                {cameraOn ? 'Cam On' : 'Turn Cam On'}
              </Button>
              <Button size="sm" variant="danger" onClick={stopSession}>
                <PhoneOff className="w-3.5 h-3.5" />
                End Call
              </Button>
            </>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="mx-5 mt-4 text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg px-3.5 py-2.5">
          {errorMsg}
        </div>
      )}

      {/* Main 2-Column Face-to-Face Studio Stage + Live Transcript */}
      <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Left 7 Cols: Face-to-Face Stage (Camera + Gemini Mentor Presence) */}
        <div className="lg:col-span-7 flex flex-col gap-3">
          {showCameraStage ? (
            <div className="relative rounded-xl overflow-hidden bg-slate-950 border border-slate-200 dark:border-slate-800 aspect-video flex items-center justify-center">
              {/* Live User Webcam */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover scale-x-[-1] transition-opacity duration-200 ${
                  status === 'live' && cameraOn ? 'opacity-100' : 'opacity-0'
                }`}
              />
              <canvas ref={canvasRef} className="hidden" />

              {/* Pre-call / Connecting state */}
              {status !== 'live' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 space-y-4">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
                    {status === 'connecting' ? (
                      <Loader2 className="w-6 h-6 animate-spin" />
                    ) : (
                      <Video className="w-6 h-6" />
                    )}
                  </div>
                  <div className="space-y-1.5 max-w-md">
                    <h2 className="text-base font-semibold text-white">
                      {status === 'connecting'
                        ? 'Connecting webcam & Gemini Live Mentor...'
                        : `${activeModeMeta.label} — Face-to-Face Studio`}
                    </h2>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {activeModeMeta.description}. Speak naturally in{' '}
                      <strong className="text-white">{language}</strong> — Chokma sees you on
                      camera, responds with natural voice ({voiceName}), and lets you interrupt
                      anytime.
                    </p>
                  </div>
                  {status === 'idle' && (
                    <Button variant="primary" onClick={startSession}>
                      <Camera className="w-4 h-4" />
                      Turn On Camera &amp; Start Talking
                    </Button>
                  )}
                </div>
              )}

              {/* Camera Paused Fallback during live call */}
              {status === 'live' && !cameraOn && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 text-slate-300 gap-2">
                  <CameraOff className="w-8 h-8 text-slate-500" />
                  <span className="text-xs">Camera paused — voice conversation remains live</span>
                </div>
              )}

              {/* Picture-in-Picture Gemini AI Mentor Presence Tile (top-right) */}
              {status === 'live' && (
                <div className="absolute top-3 right-3 w-44 rounded-xl bg-slate-950/85 backdrop-blur-md border border-white/15 p-3 text-white shadow-lg flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center transition-transform duration-100"
                    style={{
                      transform: `scale(${mentorRingScale})`,
                      background: agentSpeaking
                        ? 'radial-gradient(circle at 35% 35%, #818CF8, #4338CA 65%, #1E1B4B)'
                        : 'radial-gradient(circle at 35% 35%, #475569, #1E293B 75%)',
                    }}
                  >
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate">Chokma Mentor</p>
                    <p className="text-[11px] text-slate-300 truncate">
                      {agentSpeaking ? 'Speaking...' : 'Watching & listening'}
                    </p>
                  </div>
                </div>
              )}

              {/* Scrim Footer Bar with Real-Time Voice Activity & Language */}
              {status === 'live' && (
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent pt-8 pb-3 px-4 flex items-center justify-between gap-3 text-xs text-white">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex items-end gap-0.5 h-3.5" aria-hidden="true">
                      {[0.4, 0.85, 1, 0.65].map((mult, idx) => {
                        const activeLvl = agentSpeaking ? agentLevel : micLevel;
                        const h = Math.max(20, Math.min(100, Math.round(activeLvl * mult * 100)));
                        return (
                          <span
                            key={idx}
                            className={`w-0.5 rounded-full transition-all duration-75 ${
                              agentSpeaking ? 'bg-indigo-400' : 'bg-emerald-400'
                            }`}
                            style={{ height: `${h}%` }}
                          />
                        );
                      })}
                    </div>
                    <span className="font-medium truncate">
                      {agentSpeaking
                        ? 'Chokma Mentor is speaking — interrupt anytime'
                        : micMuted
                        ? 'Microphone muted'
                        : 'Listening to you live'}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-200 whitespace-nowrap shrink-0">
                    {language} · {voiceName}
                  </span>
                </div>
              )}
            </div>
          ) : (
            /* Hands-Free Air Voice Stage */
            <div className="rounded-xl bg-slate-950 border border-slate-200 dark:border-slate-800 aspect-video min-h-[340px] flex flex-col items-center justify-center p-8 text-center relative overflow-hidden">
              <div className="relative flex items-center justify-center">
                {/* Outer listening halo */}
                <div
                  className="absolute w-44 h-44 rounded-full border border-indigo-400/20 transition-transform duration-100"
                  style={{ transform: `scale(${agentSpeaking ? mentorRingScale : userRingScale})` }}
                />
                {/* Core voice presence orb */}
                <div
                  className="w-32 h-32 rounded-full flex items-center justify-center transition-transform duration-100"
                  style={{
                    transform: `scale(${agentSpeaking ? mentorRingScale : userRingScale})`,
                    background:
                      status === 'live'
                        ? agentSpeaking
                          ? 'radial-gradient(circle at 35% 35%, #818CF8, #4338CA 62%, #1E1B4B)'
                          : 'radial-gradient(circle at 35% 35%, #6366F1, #312E81 68%, #0F172A)'
                        : 'radial-gradient(circle at 35% 35%, #334155, #1E293B 72%, #0F172A)',
                  }}
                >
                  {status === 'connecting' ? (
                    <Loader2 className="w-8 h-8 text-white animate-spin" />
                  ) : agentSpeaking ? (
                    <Volume2 className="w-8 h-8 text-white" />
                  ) : (
                    <Mic className="w-8 h-8 text-white" />
                  )}
                </div>
              </div>

              <div className="mt-7 space-y-1.5 max-w-md">
                <h2 className="text-base font-semibold text-white">
                  {status === 'connecting'
                    ? 'Connecting to Chokma Voice...'
                    : status === 'live'
                    ? agentSpeaking
                      ? 'Chokma Mentor is speaking — interrupt anytime'
                      : micMuted
                      ? 'Microphone muted'
                      : 'Listening — speak naturally in any language'
                    : `${activeModeMeta.label} — Air Voice Assistant`}
                </h2>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {activeModeMeta.description}. Active language:{' '}
                  <strong className="text-white">{language}</strong> · Voice:{' '}
                  <strong className="text-white">{voiceName}</strong>.
                </p>
              </div>

              {status === 'idle' && (
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                  <Button variant="primary" onClick={startSession}>
                    <Mic className="w-4 h-4" />
                    Start Speaking Now
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Quick Live Prompts + Mid-Call Text Input */}
          {status === 'live' ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => sendMidCallText(activeModeMeta.quickStarter)}
                  className="text-[11px] px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Prompt: {activeModeMeta.quickStarter}
                </button>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendMidCallText();
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={liveTextInput}
                  onChange={(e) => setLiveTextInput(e.target.value)}
                  placeholder="Type a follow-up question or paste code mid-call..."
                  className="flex-1 h-9 px-3 text-xs rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-600/30"
                />
                <Button type="submit" size="sm" variant="outline" disabled={!liveTextInput.trim()}>
                  <Send className="w-3.5 h-3.5" />
                  Send
                </Button>
              </form>
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Tip: Select your preferred language &amp; voice above before starting. You can toggle
              your camera on or off anytime during the call.
            </p>
          )}
        </div>

        {/* Right 5 Cols: Real-Time Conversation Transcript & Actions */}
        <div className="lg:col-span-5 flex flex-col border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-950/40 min-h-[380px] max-h-[520px]">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Live Transcript
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {status === 'live' ? `Captions · ${language}` : 'Captions appear automatically during calls'}
              </p>
            </div>
            {transcripts.length > 0 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void handleCopyTranscript()}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer"
                  title="Copy transcript"
                >
                  {copiedTranscript ? (
                    <Check className="w-3 h-3 text-emerald-600" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  Copy
                </button>
                {onSaveToChat && (
                  <button
                    type="button"
                    disabled={savingToChat}
                    onClick={() => void handleSaveToChat()}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-indigo-700 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 cursor-pointer disabled:opacity-50"
                    title="Summarize & save to Text Chat"
                  >
                    {savingToChat ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <MessageSquarePlus className="w-3 h-3" />
                    )}
                    Save to Chat
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {transcripts.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-xs text-slate-500 dark:text-slate-400 px-4 space-y-2">
                <p className="font-medium text-slate-700 dark:text-slate-300">
                  Ready for live conversation
                </p>
                <p className="leading-relaxed">
                  Click start and speak in English, Hindi, Telugu, Tamil, Kannada, Spanish, or any
                  supported language. Both your words and Chokma&apos;s replies transcribe here in
                  real time.
                </p>
              </div>
            ) : (
              transcripts.map((t) => (
                <div
                  key={t.id}
                  className={`flex flex-col ${t.speaker === 'you' ? 'items-end' : 'items-start'}`}
                >
                  <span className="text-[10px] text-slate-400 mb-0.5 font-mono tabular-nums">
                    {t.speaker === 'you' ? 'You' : 'Chokma Mentor'} · {t.timestamp}
                  </span>
                  <div
                    className={`max-w-[92%] rounded-xl px-3.5 py-2 text-xs leading-relaxed ${
                      t.speaker === 'you'
                        ? 'bg-indigo-700 text-white'
                        : 'bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-slate-800 dark:text-slate-100'
                    }`}
                  >
                    {t.text}
                  </div>
                </div>
              ))
            )}
            <div ref={transcriptEndRef} />
          </div>
        </div>
      </div>
    </Surface>
  );
}
