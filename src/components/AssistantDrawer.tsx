import React, { useEffect, useRef, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import {
  ArrowUpRight,
  Bot,
  Headphones,
  Loader2,
  Plus,
  Send,
  Video,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useApp } from '../contexts/AppContext';
import { ChatMessage } from '../types';
import { synthesizeSpeechWithAgent } from '../services/api';
import { SUPPORTED_LANGUAGES } from './LiveMentorStudio';
import { Button, Select } from './ui/Primitives';

const QUICK_PROMPTS = [
  'What should I learn today?',
  'Which jobs fit my profile right now?',
  'What skills am I missing for my target role?',
  'Prepare me for a technical interview.',
];

function getMessageTime(msg: ChatMessage): number {
  const ts = msg.createdAt as { toMillis?: () => number; seconds?: number } | null | undefined;
  if (ts && typeof ts.toMillis === 'function') return ts.toMillis();
  if (ts && typeof ts.seconds === 'number') return ts.seconds * 1000;
  return Date.now();
}

export function AssistantDrawer({
  open,
  onClose,
  initialPrompt,
}: {
  open: boolean;
  onClose: () => void;
  initialPrompt?: string;
}) {
  const {
    user,
    isLocalSession,
    localMessagesByConv,
    conversations,
    createConversation,
    askAssistant,
  } = useApp();
  const navigate = useNavigate();
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [language, setLanguage] = useState('Auto-Detect');
  const [sending, setSending] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [failedPrompt, setFailedPrompt] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialPrompt && open) {
      setInput(initialPrompt);
    }
  }, [initialPrompt, open]);

  useEffect(() => {
    if (!activeConvId && conversations.length > 0) {
      setActiveConvId(conversations[0].id);
    }
  }, [conversations, activeConvId]);

  useEffect(() => {
    if (!user || !activeConvId || !open) return;
    if (isLocalSession) {
      setMessages(localMessagesByConv[activeConvId] || []);
      return;
    }
    const q = query(
      collection(db, 'users', user.uid, 'conversations', activeConvId, 'messages'),
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
        handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/conversations/${activeConvId}/messages`);
      }
    );
    return () => unsub();
  }, [user, activeConvId, open, isLocalSession, localMessagesByConv]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  useEffect(() => {
    if (!open && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setSpeakingId(null);
    }
  }, [open]);

  if (!open) return null;

  const handleSend = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || sending) return;
    setSending(true);
    setLastError(null);
    setFailedPrompt(null);
    setInput('');
    try {
      let convId = activeConvId;
      let currentHistory = messages;
      if (!convId) {
        convId = await createConversation(text.slice(0, 60));
        setActiveConvId(convId);
        currentHistory = [];
      }
      await askAssistant(convId, text, currentHistory, language);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Assistant request failed';
      setLastError(errMsg);
      setFailedPrompt(text);
      setInput(text);
      toast.error(errMsg);
    } finally {
      setSending(false);
    }
  };

  const handleSpeak = async (msg: ChatMessage) => {
    if (speakingId === msg.id) {
      audioRef.current?.pause();
      audioRef.current = null;
      setSpeakingId(null);
      return;
    }
    audioRef.current?.pause();
    setSpeakingId(msg.id);
    try {
      const res = await synthesizeSpeechWithAgent({
        text: msg.content,
        voiceName: 'Zephyr',
        language,
      });
      const audio = new Audio(res.audioDataUrl);
      audioRef.current = audio;
      audio.onended = () => setSpeakingId(null);
      audio.onerror = () => setSpeakingId(null);
      await audio.play();
    } catch (err) {
      setSpeakingId(null);
      toast.error(err instanceof Error ? err.message : 'Could not play audio');
    }
  };

  const handleNewChat = async () => {
    try {
      const id = await createConversation('New career session');
      setActiveConvId(id);
      setMessages([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create conversation');
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Chokma AI Career Assistant"
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/30 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <aside
        className="w-full max-w-md h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-indigo-700 text-white flex items-center justify-center">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Chokma Assistant
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Google Gemini Career Mentor
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleNewChat}
                title="New conversation"
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-100 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigate('/assistant');
                }}
                title="Open full AI workspace"
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-100 cursor-pointer"
              >
                <ArrowUpRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close assistant"
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick launch to Air Voice, Live Camera & Language switcher */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigate('/assistant?mode=voice');
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/70 cursor-pointer"
              >
                <Headphones className="w-3.5 h-3.5" />
                Air Voice
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigate('/assistant?mode=video');
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
              >
                <Video className="w-3.5 h-3.5" />
                Live Camera
              </button>
            </div>
            <Select
              aria-label="Response language"
              className="w-32 h-7 text-[11px]"
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
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {messages.length === 0 ? (
            <div className="space-y-4 pt-4">
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Ask any career, coding, cloud, or interview question in your preferred language.
                Switch to Air Voice or Live Camera above for real-time spoken or face-to-face mentoring.
              </p>
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Suggested questions
                </p>
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => handleSend(prompt)}
                    className="w-full text-left px-3.5 py-2.5 text-xs text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 rounded-lg transition-colors cursor-pointer"
                  >
                    {prompt}
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
                  <div className="flex items-center gap-2.5 mb-1">
                    {m.agentUsed && (
                      <span className="text-[11px] font-medium text-violet-700 dark:text-violet-400">
                        {m.agentUsed}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleSpeak(m)}
                      className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-indigo-700 dark:hover:text-indigo-400 cursor-pointer"
                    >
                      {speakingId === m.id ? (
                        <VolumeX className="w-3 h-3 text-indigo-600" />
                      ) : (
                        <Volume2 className="w-3 h-3" />
                      )}
                      <span>{speakingId === m.id ? 'Stop' : 'Listen'}</span>
                    </button>
                  </div>
                )}
                <div
                  className={`max-w-[90%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-indigo-700 text-white'
                      : 'bg-slate-50 dark:bg-slate-800/90 text-slate-800 dark:text-slate-100 border border-slate-200/80 dark:border-slate-700'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))
          )}
          {sending && (
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
              <span>Gemini Career Agent preparing answer...</span>
            </div>
          )}
          {lastError && !sending && (
            <div className="rounded-lg border border-red-200 dark:border-red-900/70 bg-red-50 dark:bg-red-950/40 px-3.5 py-2.5 text-xs text-red-700 dark:text-red-300 flex items-center justify-between gap-2">
              <span className="leading-snug">{lastError}</span>
              {failedPrompt && (
                <button
                  type="button"
                  onClick={() => void handleSend(failedPrompt)}
                  className="shrink-0 font-semibold underline underline-offset-2 hover:text-red-900 dark:hover:text-red-200 cursor-pointer"
                >
                  Retry
                </button>
              )}
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
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Chokma AI in any language..."
            aria-label="Message Chokma AI Assistant"
            className="flex-1 h-9 px-3 text-xs rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600/30 focus:border-indigo-600"
          />
          <Button type="submit" size="sm" disabled={sending || !input.trim()}>
            <Send className="w-3.5 h-3.5" />
            Send
          </Button>
        </form>
      </aside>
    </div>
  );
}
