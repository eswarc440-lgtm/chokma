import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import {
  ArrowRight,
  Bot,
  Globe,
  Headphones,
  Loader2,
  MessageSquare,
  Mic,
  Plus,
  Send,
  Square,
  Trash2,
  Video,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { toast } from 'sonner';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useApp } from '../contexts/AppContext';
import { ChatMessage } from '../types';
import {
  synthesizeSpeechWithAgent,
  transcribeAudioWithAgent,
} from '../services/api';
import {
  GEMINI_VOICES,
  LiveMentorStudio,
  SUPPORTED_LANGUAGES,
} from '../components/LiveMentorStudio';
import { Button, ConfirmDialog, Select, Surface } from '../components/ui/Primitives';

const SUGGESTED_QUESTIONS = [
  'What should I learn today?',
  'Which jobs are suitable for my current profile?',
  'Explain AWS IAM roles vs policies with a real troubleshooting scenario.',
  'What skills am I missing for my selected target role?',
  'What practical project should I build next?',
  'Help me prepare for a technical interview — ask me 3 real questions.',
];

type AssistantMode = 'chat' | 'voice' | 'video';

function getMessageTime(msg: ChatMessage): number {
  const ts = msg.createdAt as { toMillis?: () => number; seconds?: number } | null | undefined;
  if (ts && typeof ts.toMillis === 'function') return ts.toMillis();
  if (ts && typeof ts.seconds === 'number') return ts.seconds * 1000;
  return Date.now();
}

export function AssistantPage() {
  const {
    user,
    isLocalSession,
    localMessagesByConv,
    conversations,
    selectedJobs,
    dailyTasks,
    courses,
    createConversation,
    deleteConversation,
    askAssistant,
    buildAssistantContext,
  } = useApp();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialModeParam = searchParams.get('mode');
  const [mode, setMode] = useState<AssistantMode>(
    initialModeParam === 'voice' || initialModeParam === 'video' ? initialModeParam : 'chat'
  );
  const [language, setLanguage] = useState<string>('Auto-Detect');
  const [voiceName, setVoiceName] = useState<string>('Zephyr');

  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [deleteConvId, setDeleteConvId] = useState<string | null>(null);

  // Voice recording -> transcription state in Text Chat mode
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Text-to-speech playback state
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const param = searchParams.get('mode');
    if (param === 'voice' || param === 'video' || param === 'chat') {
      setMode(param);
    }
  }, [searchParams]);

  const handleModeChange = (next: AssistantMode) => {
    setMode(next);
    setSearchParams(next === 'chat' ? {} : { mode: next }, { replace: true });
  };

  useEffect(() => {
    if (!activeId && conversations.length > 0) {
      setActiveId(conversations[0].id);
    }
  }, [conversations, activeId]);

  useEffect(() => {
    if (!user || !activeId) {
      setMessages([]);
      return;
    }
    if (isLocalSession) {
      setMessages(localMessagesByConv[activeId] || []);
      return;
    }
    const q = query(
      collection(db, 'users', user.uid, 'conversations', activeId, 'messages'),
      where('userId', '==', user.uid)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as ChatMessage)
          .sort((a, b) => getMessageTime(a) - getMessageTime(b));
        setMessages(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/conversations/${activeId}/messages`);
      }
    );
    return () => unsub();
  }, [user, activeId, isLocalSession, localMessagesByConv]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  useEffect(() => {
    return () => {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
    };
  }, []);

  const userContext = useMemo(() => buildAssistantContext(), [buildAssistantContext]);

  const handleNew = async () => {
    const id = await createConversation('New career session');
    setActiveId(id);
    setMessages([]);
  };

  const handleSend = async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || sending) return;
    setSending(true);
    setInput('');
    try {
      let convId = activeId;
      let currentHistory = messages;
      if (!convId) {
        convId = await createConversation(text.slice(0, 60));
        setActiveId(convId);
        currentHistory = [];
      }
      await askAssistant(convId, text, currentHistory, language);
    } catch (err) {
      setInput(text);
      toast.error(err instanceof Error ? err.message : 'Assistant request failed');
    } finally {
      setSending(false);
    }
  };

  // Speak any assistant reply aloud via Gemini 3.8 Flash Lite TTS
  const handleSpeakMessage = async (msg: ChatMessage) => {
    if (speakingMsgId === msg.id) {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
      setSpeakingMsgId(null);
      return;
    }
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }
    setSpeakingMsgId(msg.id);
    try {
      const res = await synthesizeSpeechWithAgent({
        text: msg.content,
        voiceName,
        language,
      });
      const audio = new Audio(res.audioDataUrl);
      audioPlayerRef.current = audio;
      audio.onended = () => {
        setSpeakingMsgId(null);
        audioPlayerRef.current = null;
      };
      audio.onerror = () => {
        setSpeakingMsgId(null);
        audioPlayerRef.current = null;
        toast.error('Could not play synthesized speech audio.');
      };
      await audio.play();
    } catch (err) {
      setSpeakingMsgId(null);
      toast.error(err instanceof Error ? err.message : 'Voice playback failed');
    }
  };

  // Quick mic dictate -> Gemini 3.5 Transcribe -> automatically send
  const handleToggleMicRecord = async () => {
    if (recording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        if (blob.size < 400) return;

        setTranscribing(true);
        try {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const result = typeof reader.result === 'string' ? reader.result : '';
              resolve(result.split(',')[1] || '');
            };
            reader.onerror = () => reject(new Error('Failed to read recorded audio'));
            reader.readAsDataURL(blob);
          });

          const res = await transcribeAudioWithAgent({
            audioBase64: base64,
            mimeType,
            language,
          });
          if (res.transcript) {
            setInput(res.transcript);
            await handleSend(res.transcript);
          } else {
            toast.info('No speech detected. Please speak clearly and try again.');
          }
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Voice transcription failed');
        } finally {
          setTranscribing(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      toast.error('Microphone access was denied. Please allow microphone permission in your browser.');
    }
  };

  const pendingTask = dailyTasks.find((t) => t.status !== 'completed');
  const activeCourse = courses.find((c) => c.status === 'in_progress') || courses[0];

  return (
    <div className="space-y-5">
      {/* Top 3-Way Gemini AI Mode Bar */}
      <Surface className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleModeChange('chat')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              mode === 'chat'
                ? 'bg-indigo-700 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-slate-700'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>1. Text &amp; Voice Chat</span>
          </button>

          <button
            type="button"
            onClick={() => handleModeChange('voice')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              mode === 'voice'
                ? 'bg-indigo-700 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-slate-700'
            }`}
          >
            <Headphones className="w-3.5 h-3.5" />
            <span>2. Air Voice Assistant</span>
          </button>

          <button
            type="button"
            onClick={() => handleModeChange('video')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              mode === 'video'
                ? 'bg-indigo-700 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-slate-700'
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span>3. Live Camera &amp; Voice</span>
          </button>
        </div>

        {/* Multi-language & Voice selectors */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <Globe className="w-3.5 h-3.5" />
            <Select
              aria-label="Assistant language"
              className="w-40 h-8 text-xs"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </Select>
          </div>
          <Select
            aria-label="Assistant voice"
            className="w-44 h-8 text-xs"
            value={voiceName}
            onChange={(e) => setVoiceName(e.target.value)}
          >
            {GEMINI_VOICES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </Select>
        </div>
      </Surface>

      {/* WAY 2 & WAY 3: Real-time Gemini Live Air Voice OR Face-to-Face Camera Studio */}
      {mode === 'voice' || mode === 'video' ? (
        <LiveMentorStudio
          key={mode}
          mode={mode}
          language={language}
          voiceName={voiceName}
          userContext={userContext}
          onSaveToChat={async (transcriptSummary) => {
            const convId = await createConversation(
              `${mode === 'video' ? 'Live Camera' : 'Air Voice'} Session (${language})`
            );
            setActiveId(convId);
            handleModeChange('chat');
            setSending(true);
            try {
              await askAssistant(convId, transcriptSummary, [], language);
            } finally {
              setSending(false);
            }
          }}
        />
      ) : (
        /* WAY 1: Direct Multi-Language Text + Voice Dictation + TTS Chat */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[calc(100vh-220px)]">
          {/* Left Conversation History Rail */}
          <Surface className="lg:col-span-3 flex flex-col max-h-[calc(100vh-220px)]">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Conversations
              </h2>
              <Button size="sm" variant="outline" onClick={handleNew}>
                <Plus className="w-3.5 h-3.5" />
                New
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {conversations.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 p-4 text-center">
                  Ask any question to start your persistent coaching history.
                </p>
              ) : (
                conversations.map((conv) => {
                  const isActive = conv.id === activeId;
                  return (
                    <div
                      key={conv.id}
                      className={`group flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg transition-colors ${
                        isActive
                          ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-200'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setActiveId(conv.id)}
                        className="flex-1 min-w-0 text-left cursor-pointer"
                      >
                        <p className="text-xs font-medium truncate">{conv.title}</p>
                        {conv.activeAgent && (
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {conv.activeAgent}
                          </p>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConvId(conv.id)}
                        aria-label="Delete conversation"
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-600 transition-opacity cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Live context shortcuts */}
            <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2 text-xs">
              <p className="text-[11px] font-medium text-slate-500">Live Context Connected</p>
              {selectedJobs[0] && (
                <button
                  type="button"
                  onClick={() => navigate(`/jobs/${selectedJobs[0].jobId}`)}
                  className="w-full text-left px-2.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between cursor-pointer"
                >
                  <span className="truncate font-medium text-slate-800 dark:text-slate-200">
                    {selectedJobs[0].jobTitle} ({selectedJobs[0].matchScore}%)
                  </span>
                  <ArrowRight className="w-3 h-3 shrink-0 text-slate-400" />
                </button>
              )}
              {pendingTask && (
                <button
                  type="button"
                  onClick={() => navigate('/learning/tasks')}
                  className="w-full text-left px-2.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between cursor-pointer"
                >
                  <span className="truncate text-slate-700 dark:text-slate-300">
                    Task: {pendingTask.title}
                  </span>
                  <ArrowRight className="w-3 h-3 shrink-0 text-slate-400" />
                </button>
              )}
              {activeCourse && (
                <button
                  type="button"
                  onClick={() => navigate('/learning/courses')}
                  className="w-full text-left px-2.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between cursor-pointer"
                >
                  <span className="truncate text-slate-700 dark:text-slate-300">
                    Course: {activeCourse.title}
                  </span>
                  <ArrowRight className="w-3 h-3 shrink-0 text-slate-400" />
                </button>
              )}
            </div>
          </Surface>

          {/* Main Chat Workspace */}
          <Surface className="lg:col-span-9 flex flex-col max-h-[calc(100vh-220px)]">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-700 text-white flex items-center justify-center">
                  <Bot className="w-4 h-4" />
                </div>
                <div>
                  <h1 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Chokma AI Career Assistant
                  </h1>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Powered by Google Gemini · Multi-language Text, Voice Dictation &amp; Read-Aloud
                  </p>
                </div>
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Language: <strong className="text-slate-700 dark:text-slate-200">{language}</strong>
              </span>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {messages.length === 0 ? (
                <div className="max-w-2xl mx-auto py-8 space-y-6">
                  <div className="space-y-1.5 text-center">
                    <MessageSquare className="w-6 h-6 text-indigo-600 mx-auto" />
                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      Ask anything — career, coding, cloud, or interview prep
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Type or tap the mic to ask in any language, or switch above to Air Voice or Live Camera mode for real-time face-to-face conversation.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {SUGGESTED_QUESTIONS.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => handleSend(q)}
                        className="text-left px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-slate-50 dark:hover:bg-slate-800/70 text-xs text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    {m.role === 'assistant' && (
                      <div className="flex items-center gap-3 mb-1">
                        {m.agentUsed && (
                          <span className="text-[11px] font-medium text-violet-700 dark:text-violet-400">
                            {m.agentUsed}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleSpeakMessage(m)}
                          className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-indigo-700 dark:hover:text-indigo-400 cursor-pointer"
                          title={speakingMsgId === m.id ? 'Stop speaking' : 'Listen to response'}
                        >
                          {speakingMsgId === m.id ? (
                            <>
                              <VolumeX className="w-3.5 h-3.5 text-indigo-600" />
                              <span className="text-indigo-600 font-medium">Stop</span>
                            </>
                          ) : (
                            <>
                              <Volume2 className="w-3.5 h-3.5" />
                              <span>Listen</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                    <div
                      className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                        m.role === 'user'
                          ? 'bg-indigo-700 text-white'
                          : 'bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-slate-100 border border-slate-200/80 dark:border-slate-700'
                      }`}
                    >
                      {m.content}
                    </div>
                  </div>
                ))
              )}
              {sending && (
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                  <span>Gemini Career Agent preparing your answer...</span>
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSend();
              }}
              className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2"
            >
              <button
                type="button"
                onClick={() => void handleToggleMicRecord()}
                disabled={sending || transcribing}
                aria-label={recording ? 'Stop recording voice question' : 'Ask with voice microphone'}
                title={recording ? 'Stop recording and send' : 'Speak your question (multi-language)'}
                className={`h-10 w-10 rounded-lg border flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                  recording
                    ? 'bg-red-600 border-red-600 text-white'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {transcribing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : recording ? (
                  <Square className="w-4 h-4" />
                ) : (
                  <Mic className="w-4 h-4" />
                )}
              </button>

              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  recording
                    ? 'Listening... tap the red square when finished speaking'
                    : transcribing
                    ? 'Transcribing your voice...'
                    : 'Ask anything in any language — career, technical concepts, projects, or interviews...'
                }
                aria-label="Message AI Career Assistant"
                className="flex-1 h-10 px-4 text-sm rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600/30 focus:border-indigo-600"
              />
              <Button type="submit" disabled={sending || transcribing || !input.trim()}>
                <Send className="w-4 h-4" />
                Send
              </Button>
            </form>
          </Surface>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteConvId)}
        onClose={() => setDeleteConvId(null)}
        onConfirm={() => {
          if (deleteConvId) {
            deleteConversation(deleteConvId);
            if (activeId === deleteConvId) setActiveId(null);
          }
        }}
        title="Delete conversation?"
        message="This removes the conversation session from your history."
      />
    </div>
  );
}
