import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { BookOpen, Loader2, ChevronDown, ChevronUp, X, Sparkles, User, Users, Eye, Volume2, Square, Mic, Type, Minus, Plus, Pause, Play, RotateCcw, UserCircle } from 'lucide-react';

type POVType = 'first_person' | 'character' | 'third_person';
type FontFamily = 'sans' | 'serif' | 'mono';
type TTSModel = 'browser' | 'kokoro';
type StoryLength = 'short' | 'medium' | 'long';

interface UserPersona {
  age: string;
  gender: 'male' | 'female' | '';
  build: string;
  description: string;
}

const KOKORO_VOICES = [
  { value: 'af_bella', label: 'Bella (F)', gender: 'female' },
  { value: 'af_nicole', label: 'Nicole (F)', gender: 'female' },
  { value: 'af_sarah', label: 'Sarah (F)', gender: 'female' },
  { value: 'af_sky', label: 'Sky (F)', gender: 'female' },
  { value: 'af_nova', label: 'Nova (F)', gender: 'female' },
  { value: 'am_adam', label: 'Adam (M)', gender: 'male' },
  { value: 'am_michael', label: 'Michael (M)', gender: 'male' },
  { value: 'bf_emma', label: 'Emma UK (F)', gender: 'female' },
  { value: 'bm_george', label: 'George UK (M)', gender: 'male' },
];

const FONT_OPTIONS: { value: FontFamily; label: string; className: string }[] = [
  { value: 'sans', label: 'Sans', className: 'font-sans' },
  { value: 'serif', label: 'Serif', className: 'font-serif' },
  { value: 'mono', label: 'Mono', className: 'font-mono' },
];

const TEXT_SIZES = [
  { value: 12, label: 'XS' },
  { value: 14, label: 'S' },
  { value: 16, label: 'M' },
  { value: 18, label: 'L' },
  { value: 20, label: 'XL' },
  { value: 24, label: '2XL' },
];

interface StoryPanelProps {
  imagePrompt: string;
  onClose?: () => void;
}

export function StoryPanel({ imagePrompt, onClose }: StoryPanelProps) {
  const [userComments, setUserComments] = useState('');
  const [story, setStory] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [editablePrompt, setEditablePrompt] = useState(imagePrompt);
  const [error, setError] = useState<string | null>(null);
  const [pov, setPov] = useState<POVType>('first_person');
  const [personaDialogOpen, setPersonaDialogOpen] = useState(false);
  const [persona, setPersona] = useState<UserPersona>(() => {
    const saved = localStorage.getItem('storyUserPersona');
    if (saved) {
      try { return JSON.parse(saved); } catch { }
    }
    return { age: '', gender: '', build: '', description: '' };
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceIndex, setSelectedVoiceIndex] = useState(0);
  const [ttsModel, setTtsModel] = useState<TTSModel>(() => {
    const saved = localStorage.getItem('storyTtsModel');
    return (saved as TTSModel) || 'browser';
  });
  const [kokoroVoice, setKokoroVoice] = useState(() => {
    return localStorage.getItem('storyKokoroVoice') || 'af_bella';
  });
  const [isLoadingKokoro, setIsLoadingKokoro] = useState(false);
  const [fontFamily, setFontFamily] = useState<FontFamily>(() => {
    const saved = localStorage.getItem('storyFontFamily');
    return (saved as FontFamily) || 'sans';
  });
  const [fontSize, setFontSize] = useState<number>(() => {
    const saved = localStorage.getItem('storyFontSize');
    return saved ? parseInt(saved) : 16;
  });
  const [storyLength, setStoryLength] = useState<StoryLength>(() => {
    const saved = localStorage.getItem('storyLength');
    return (saved as StoryLength) || 'medium';
  });
  const storyContainerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    localStorage.setItem('storyFontFamily', fontFamily);
  }, [fontFamily]);

  useEffect(() => {
    localStorage.setItem('storyFontSize', fontSize.toString());
  }, [fontSize]);

  useEffect(() => {
    localStorage.setItem('storyUserPersona', JSON.stringify(persona));
  }, [persona]);

  useEffect(() => {
    localStorage.setItem('storyTtsModel', ttsModel);
  }, [ttsModel]);

  useEffect(() => {
    localStorage.setItem('storyKokoroVoice', kokoroVoice);
  }, [kokoroVoice]);

  useEffect(() => {
    setEditablePrompt(imagePrompt);
  }, [imagePrompt]);

  useEffect(() => {
    if (storyContainerRef.current) {
      storyContainerRef.current.scrollTop = storyContainerRef.current.scrollHeight;
    }
  }, [story]);

  useEffect(() => {
    const loadVoices = () => {
      const voices = speechSynthesis.getVoices();
      console.log('🔊 Voices loaded:', voices.length);
      const englishVoices = voices.filter(v => v.lang.startsWith('en'));
      console.log('🔊 English voices:', englishVoices.length);
      if (englishVoices.length > 0) {
        setAvailableVoices(englishVoices);
        const femaleVoice = englishVoices.findIndex(v => 
          v.name.toLowerCase().includes('female') || 
          v.name.toLowerCase().includes('samantha') ||
          v.name.toLowerCase().includes('victoria') ||
          v.name.toLowerCase().includes('karen')
        );
        if (femaleVoice >= 0) setSelectedVoiceIndex(femaleVoice);
      }
    };
    
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
    
    return () => {
      speechSynthesis.cancel();
    };
  }, []);

  const handleGenerate = async () => {
    if (!editablePrompt.trim()) {
      setError('No image prompt available');
      return;
    }

    setIsGenerating(true);
    setStory('');
    setError(null);

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/story/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imagePrompt: editablePrompt,
          userComments: userComments.trim(),
          pov,
          storyLength,
          persona: (persona.age || persona.gender || persona.build || persona.description) ? persona : undefined,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate story');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let buffer = '';

      const parseEventBlock = (block: string) => {
        const normalized = block.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const dataLines = normalized.split('\n').filter(line => line.startsWith('data: '));
        const dataContent = dataLines.map(line => line.slice(6)).join('');
        if (dataContent) {
          try {
            const data = JSON.parse(dataContent);
            if (data.content) {
              setStory(prev => prev + data.content);
            } else if (data.error) {
              setError(data.error);
            } else if (data.done) {
              setIsGenerating(false);
            }
          } catch {
          }
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        buffer = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const eventBlock of events) {
          parseEventBlock(eventBlock);
        }
      }

      if (buffer.trim()) {
        parseEventBlock(buffer);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Failed to generate story');
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsGenerating(false);
    }
  };

  const handlePlayStory = async () => {
    if (!story.trim()) return;
    
    const cleanedStory = story.replace(/\*/g, '').replace(/["'"]/g, '');

    if (ttsModel === 'kokoro') {
      // Use Kokoro TTS via Replicate
      setIsLoadingKokoro(true);
      setError(null);
      try {
        const response = await fetch('/api/story/tts/kokoro', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: cleanedStory,
            voice: kokoroVoice,
            speed: 1.0
          })
        });
        
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || 'Failed to generate audio');
        }
        
        const data = await response.json();
        if (data.audioUrl) {
          const audio = new Audio(data.audioUrl);
          audioRef.current = audio;
          audio.onended = () => {
            setIsPlaying(false);
            audioRef.current = null;
          };
          audio.onerror = () => {
            setIsPlaying(false);
            audioRef.current = null;
            setError('Failed to play audio');
          };
          setIsPlaying(true);
          await audio.play();
        } else {
          setError('No audio URL received');
        }
      } catch (err) {
        console.error('Kokoro TTS error:', err);
        setError(err instanceof Error ? err.message : 'Failed to generate audio');
      } finally {
        setIsLoadingKokoro(false);
      }
    } else {
      // Use browser TTS
      if (availableVoices.length === 0) return;
      
      speechSynthesis.cancel();
      
      // Split into sentences to avoid Chrome's bug with long texts
      const sentences = cleanedStory.match(/[^.!?]+[.!?]+/g) || [cleanedStory];
      let currentIndex = 0;
      
      const speakNext = () => {
        if (currentIndex >= sentences.length) {
          setIsPlaying(false);
          return;
        }
        
        const utterance = new SpeechSynthesisUtterance(sentences[currentIndex].trim());
        utterance.voice = availableVoices[selectedVoiceIndex];
        utterance.rate = 0.9;
        utterance.pitch = 1;
        
        utterance.onend = () => {
          currentIndex++;
          speakNext();
        };
        
        utterance.onerror = (e) => {
          if (e.error !== 'interrupted') {
            setIsPlaying(false);
          }
        };
        
        utteranceRef.current = utterance;
        speechSynthesis.speak(utterance);
      };
      
      setIsPlaying(true);
      speakNext();
    }
  };

  const handleStopAudio = () => {
    if (ttsModel === 'kokoro' && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    } else {
      speechSynthesis.cancel();
    }
    setIsPlaying(false);
    setIsPaused(false);
  };

  const handlePauseAudio = () => {
    if (ttsModel === 'kokoro' && audioRef.current) {
      audioRef.current.pause();
    } else {
      speechSynthesis.pause();
    }
    setIsPaused(true);
  };

  const handleResumeAudio = () => {
    if (ttsModel === 'kokoro' && audioRef.current) {
      audioRef.current.play();
    } else {
      speechSynthesis.resume();
    }
    setIsPaused(false);
  };

  const handleRestartAudio = async () => {
    if (ttsModel === 'kokoro' && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.play();
    } else {
      speechSynthesis.cancel();
      setIsPaused(false);
      handlePlayStory();
    }
  };

  return (
    <div className="h-full flex flex-col bg-black/80 backdrop-blur-sm border-l border-white/10">
      <div className="flex items-center justify-between p-3 border-b border-white/10">
        <div className="flex items-center gap-2 text-white">
          <BookOpen className="h-5 w-5 text-purple-400" />
          <span className="font-medium">Story Generator</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded transition-colors"
          >
            <X className="h-4 w-4 text-white/70" />
          </button>
        )}
      </div>

      <div className="flex-1 flex flex-col min-h-0 p-3 gap-3">
        <button
          onClick={() => setShowPrompt(!showPrompt)}
          className="flex items-center justify-between w-full text-sm text-white/70 hover:text-white transition-colors"
        >
          <span>Image Prompt</span>
          {showPrompt ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>

        {showPrompt && (
          <Textarea
            value={editablePrompt}
            onChange={(e) => setEditablePrompt(e.target.value)}
            placeholder="Image prompt will appear here..."
            className="min-h-[80px] max-h-[120px] bg-slate-900/50 border-white/20 text-white/90 text-xs resize-none"
          />
        )}

        <div className="space-y-2">
          <label className="text-sm text-white/70">Point of View</label>
          <div className="flex gap-1">
            <button
              onClick={() => setPov('first_person')}
              disabled={isGenerating}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded text-xs font-medium transition-colors ${
                pov === 'first_person'
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-800 text-white/60 hover:bg-slate-700'
              }`}
            >
              <User className="h-3 w-3" />
              My POV
            </button>
            <button
              onClick={() => setPov('character')}
              disabled={isGenerating}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded text-xs font-medium transition-colors ${
                pov === 'character'
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-800 text-white/60 hover:bg-slate-700'
              }`}
            >
              <Eye className="h-3 w-3" />
              Her POV
            </button>
            <button
              onClick={() => setPov('third_person')}
              disabled={isGenerating}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded text-xs font-medium transition-colors ${
                pov === 'third_person'
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-800 text-white/60 hover:bg-slate-700'
              }`}
            >
              <Users className="h-3 w-3" />
              3rd Person
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-white/70">Story Length</label>
          <div className="flex gap-1">
            <button
              onClick={() => { setStoryLength('short'); localStorage.setItem('storyLength', 'short'); }}
              disabled={isGenerating}
              className={`flex-1 py-2 px-2 rounded text-xs font-medium transition-colors ${
                storyLength === 'short'
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-800 text-white/60 hover:bg-slate-700'
              }`}
            >
              Short
            </button>
            <button
              onClick={() => { setStoryLength('medium'); localStorage.setItem('storyLength', 'medium'); }}
              disabled={isGenerating}
              className={`flex-1 py-2 px-2 rounded text-xs font-medium transition-colors ${
                storyLength === 'medium'
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-800 text-white/60 hover:bg-slate-700'
              }`}
            >
              Medium
            </button>
            <button
              onClick={() => { setStoryLength('long'); localStorage.setItem('storyLength', 'long'); }}
              disabled={isGenerating}
              className={`flex-1 py-2 px-2 rounded text-xs font-medium transition-colors ${
                storyLength === 'long'
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-800 text-white/60 hover:bg-slate-700'
              }`}
            >
              Long
            </button>
          </div>
        </div>

        <Dialog open={personaDialogOpen} onOpenChange={setPersonaDialogOpen}>
          <DialogTrigger asChild>
            <button
              disabled={isGenerating}
              className="w-full flex items-center justify-between py-2 px-3 rounded bg-slate-800 text-white/80 text-xs hover:bg-slate-700 transition-colors"
            >
              <div className="flex items-center gap-2">
                <UserCircle className="h-4 w-4 text-purple-400" />
                <span>My Profile</span>
              </div>
              <span className="text-white/40 text-xs">
                {(persona.age || persona.gender || persona.build) ? 'Set' : 'Not set'}
              </span>
            </button>
          </DialogTrigger>
          <DialogContent className="bg-slate-900 border-white/10 text-white max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserCircle className="h-5 w-5 text-purple-400" />
                Your Profile
              </DialogTitle>
            </DialogHeader>
            <p className="text-white/60 text-sm">This info will be used to personalize stories for you.</p>
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-white/60 mb-1 block">Age</label>
                  <input
                    type="number"
                    value={persona.age}
                    onChange={(e) => setPersona(p => ({ ...p, age: e.target.value }))}
                    placeholder="25"
                    className="w-full bg-slate-800 text-white text-sm p-2 rounded border border-white/10"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/60 mb-1 block">Gender</label>
                  <select
                    value={persona.gender}
                    onChange={(e) => setPersona(p => ({ ...p, gender: e.target.value as 'male' | 'female' | '' }))}
                    className="w-full bg-slate-800 text-white text-sm p-2 rounded border border-white/10"
                  >
                    <option value="">Select...</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-white/60 mb-1 block">Build</label>
                <select
                  value={persona.build}
                  onChange={(e) => setPersona(p => ({ ...p, build: e.target.value }))}
                  className="w-full bg-slate-800 text-white text-sm p-2 rounded border border-white/10"
                >
                  <option value="">Select...</option>
                  <option value="slim">Slim</option>
                  <option value="average">Average</option>
                  <option value="athletic">Athletic</option>
                  <option value="muscular">Muscular</option>
                  <option value="stocky">Stocky</option>
                  <option value="heavyset">Heavyset</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-white/60 mb-1 block">Other Details</label>
                <Textarea
                  value={persona.description}
                  onChange={(e) => setPersona(p => ({ ...p, description: e.target.value }))}
                  placeholder="Hair color, features, etc..."
                  className="min-h-[80px] bg-slate-800 border-white/10 text-white placeholder:text-white/30 text-sm resize-none"
                />
              </div>
              <Button
                onClick={() => setPersonaDialogOpen(false)}
                className="w-full bg-purple-600 hover:bg-purple-700"
              >
                Save
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <div className="space-y-2">
          <label className="text-sm text-white/70">Your Directions (optional)</label>
          <Textarea
            value={userComments}
            onChange={(e) => setUserComments(e.target.value)}
            placeholder="Add story directions... e.g., 'she's my step-sister' or 'include foot worship'"
            className="min-h-[60px] max-h-[80px] bg-slate-900/50 border-white/20 text-white placeholder:text-white/30 text-sm resize-none"
            disabled={isGenerating}
          />
        </div>

        <div className="flex gap-2">
          {isGenerating ? (
            <Button
              onClick={handleStop}
              variant="destructive"
              className="flex-1"
            >
              <X className="h-4 w-4 mr-2" />
              Stop
            </Button>
          ) : (
            <Button
              onClick={handleGenerate}
              disabled={!editablePrompt.trim()}
              className="flex-1 bg-purple-600 hover:bg-purple-700"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Story
            </Button>
          )}
        </div>

        {error && (
          <div className="text-red-400 text-sm p-2 bg-red-900/20 rounded border border-red-500/30">
            {error}
          </div>
        )}

        {story && !isGenerating && (
          <div className="space-y-3 p-2 bg-slate-900/50 rounded border border-white/10">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Type className="h-4 w-4 text-white/70" />
                <div className="flex gap-1">
                  {FONT_OPTIONS.map((font) => (
                    <button
                      key={font.value}
                      onClick={() => setFontFamily(font.value)}
                      className={`px-2 py-1 text-xs rounded transition-colors ${font.className} ${
                        fontFamily === font.value
                          ? 'bg-purple-600 text-white'
                          : 'bg-slate-700 text-white/60 hover:bg-slate-600'
                      }`}
                    >
                      {font.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setFontSize(prev => Math.max(12, prev - 2))}
                  className="p-1 rounded bg-slate-700 text-white/70 hover:bg-slate-600 disabled:opacity-50"
                  disabled={fontSize <= 12}
                >
                  <Minus className="h-3 w-3" />
                </button>
                <span className="text-xs text-white/70 w-8 text-center">{fontSize}</span>
                <button
                  onClick={() => setFontSize(prev => Math.min(24, prev + 2))}
                  className="p-1 rounded bg-slate-700 text-white/70 hover:bg-slate-600 disabled:opacity-50"
                  disabled={fontSize >= 24}
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Mic className="h-4 w-4 text-white/70" />
                <div className="flex gap-1 flex-1">
                  <button
                    onClick={() => setTtsModel('browser')}
                    disabled={isPlaying}
                    className={`flex-1 py-1.5 px-2 rounded text-xs font-medium transition-colors ${
                      ttsModel === 'browser'
                        ? 'bg-purple-600 text-white'
                        : 'bg-slate-700 text-white/60 hover:bg-slate-600'
                    }`}
                  >
                    Browser
                  </button>
                  <button
                    onClick={() => setTtsModel('kokoro')}
                    disabled={isPlaying}
                    className={`flex-1 py-1.5 px-2 rounded text-xs font-medium transition-colors ${
                      ttsModel === 'kokoro'
                        ? 'bg-purple-600 text-white'
                        : 'bg-slate-700 text-white/60 hover:bg-slate-600'
                    }`}
                  >
                    Kokoro AI
                  </button>
                </div>
              </div>
              
              {ttsModel === 'browser' ? (
                availableVoices.length > 0 ? (
                  <select
                    value={selectedVoiceIndex}
                    onChange={(e) => {
                      const newIndex = Number(e.target.value);
                      setSelectedVoiceIndex(newIndex);
                      if (isPlaying) {
                        speechSynthesis.cancel();
                        setIsPaused(false);
                        setTimeout(() => {
                          const cleanedStory = story.replace(/\*/g, '').replace(/["'"]/g, '');
                          const sentences = cleanedStory.match(/[^.!?]+[.!?]+/g) || [cleanedStory];
                          let idx = 0;
                          const voice = availableVoices[newIndex];
                          const speakNextSentence = () => {
                            if (idx >= sentences.length) {
                              setIsPlaying(false);
                              return;
                            }
                            const utt = new SpeechSynthesisUtterance(sentences[idx].trim());
                            utt.voice = voice;
                            utt.rate = 0.9;
                            utt.pitch = 1;
                            utt.onend = () => { idx++; speakNextSentence(); };
                            utt.onerror = (ev) => { if (ev.error !== 'interrupted') setIsPlaying(false); };
                            utteranceRef.current = utt;
                            speechSynthesis.speak(utt);
                          };
                          setIsPlaying(true);
                          speakNextSentence();
                        }, 100);
                      }
                    }}
                    disabled={false}
                    className="w-full bg-slate-800 text-white/80 text-xs p-2 rounded border border-white/10"
                  >
                    {availableVoices.map((voice, index) => (
                      <option key={index} value={index}>
                        {voice.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-white/50 text-xs">No voices available</p>
                )
              ) : (
                <select
                  value={kokoroVoice}
                  onChange={(e) => setKokoroVoice(e.target.value)}
                  disabled={isPlaying}
                  className="w-full bg-slate-800 text-white/80 text-xs p-2 rounded border border-white/10"
                >
                  {KOKORO_VOICES.map((voice) => (
                    <option key={voice.value} value={voice.value}>
                      {voice.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="flex gap-2">
              {isPlaying ? (
                <>
                  <Button
                    onClick={isPaused ? handleResumeAudio : handlePauseAudio}
                    size="sm"
                    className="flex-1 bg-amber-600 hover:bg-amber-700"
                  >
                    {isPaused ? (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Resume
                      </>
                    ) : (
                      <>
                        <Pause className="h-4 w-4 mr-2" />
                        Pause
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={handleRestartAudio}
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700"
                    title="Start Over"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                  <Button
                    onClick={handleStopAudio}
                    variant="destructive"
                    size="sm"
                  >
                    <Square className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <Button
                  onClick={handlePlayStory}
                  disabled={(ttsModel === 'browser' && availableVoices.length === 0) || isLoadingKokoro}
                  size="sm"
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  {isLoadingKokoro ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <Volume2 className="h-4 w-4 mr-2" />
                      Read Story
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0">
          <ScrollArea className="h-full">
            <div
              ref={storyContainerRef}
              className="pr-4"
            >
              {isGenerating && !story && (
                <div className="flex items-center justify-center py-8 text-white/50">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  <span>Generating story...</span>
                </div>
              )}
              {story && (
                <div 
                  className={`text-white/90 leading-relaxed whitespace-pre-wrap ${
                    FONT_OPTIONS.find(f => f.value === fontFamily)?.className || 'font-sans'
                  }`}
                  style={{ fontSize: `${fontSize}px` }}
                >
                  {story}
                </div>
              )}
              {!story && !isGenerating && (
                <div className="text-white/30 text-sm text-center py-8">
                  Click "Generate Story" to create an erotic story based on the current image
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
