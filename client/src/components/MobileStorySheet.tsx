import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { BookOpen, Loader2, User, Users, Eye, Volume2, Square, Mic, Pause, Play, RotateCcw, UserCircle } from 'lucide-react';

type POVType = 'first_person' | 'character' | 'third_person';
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

interface MobileStorySheetProps {
  imagePrompt: string;
}

export function MobileStorySheet({ imagePrompt }: MobileStorySheetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [personaDialogOpen, setPersonaDialogOpen] = useState(false);
  const [userComments, setUserComments] = useState(() => {
    return localStorage.getItem('mobileStoryDirections') || '';
  });
  const [pov, setPov] = useState<POVType>(() => {
    const saved = localStorage.getItem('mobileStoryPov');
    return (saved as POVType) || 'first_person';
  });
  const [persona, setPersona] = useState<UserPersona>(() => {
    const saved = localStorage.getItem('storyUserPersona');
    if (saved) {
      try { return JSON.parse(saved); } catch { }
    }
    return { age: '', gender: '', build: '', description: '' };
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceIndex, setSelectedVoiceIndex] = useState(() => {
    const saved = localStorage.getItem('mobileStoryVoice');
    return saved ? parseInt(saved) : 0;
  });
  const [ttsModel, setTtsModel] = useState<TTSModel>(() => {
    const saved = localStorage.getItem('storyTtsModel');
    return (saved as TTSModel) || 'browser';
  });
  const [kokoroVoice, setKokoroVoice] = useState(() => {
    return localStorage.getItem('storyKokoroVoice') || 'af_bella';
  });
  const [storyLength, setStoryLength] = useState<StoryLength>(() => {
    const saved = localStorage.getItem('storyLength');
    return (saved as StoryLength) || 'medium';
  });
  const [isLoadingKokoro, setIsLoadingKokoro] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasStory, setHasStory] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const storyRef = useRef<string>('');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    localStorage.setItem('mobileStoryDirections', userComments);
  }, [userComments]);

  useEffect(() => {
    localStorage.setItem('mobileStoryPov', pov);
  }, [pov]);

  useEffect(() => {
    localStorage.setItem('storyUserPersona', JSON.stringify(persona));
  }, [persona]);

  useEffect(() => {
    localStorage.setItem('mobileStoryVoice', selectedVoiceIndex.toString());
  }, [selectedVoiceIndex]);

  useEffect(() => {
    localStorage.setItem('storyTtsModel', ttsModel);
  }, [ttsModel]);

  useEffect(() => {
    localStorage.setItem('storyKokoroVoice', kokoroVoice);
  }, [kokoroVoice]);

  useEffect(() => {
    const loadVoices = () => {
      const voices = speechSynthesis.getVoices();
      const englishVoices = voices.filter(v => v.lang.startsWith('en'));
      if (englishVoices.length > 0) {
        setAvailableVoices(englishVoices);
        const savedIndex = parseInt(localStorage.getItem('mobileStoryVoice') || '0');
        if (savedIndex < englishVoices.length) {
          setSelectedVoiceIndex(savedIndex);
        }
      }
    };
    
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
    
    return () => {
      speechSynthesis.cancel();
    };
  }, []);

  const handleGenerateStory = async () => {
    if (!imagePrompt.trim()) {
      setError('No image selected');
      return;
    }

    setIsGenerating(true);
    setError(null);
    storyRef.current = '';
    setHasStory(false);

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/story/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imagePrompt,
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
              storyRef.current += data.content;
            } else if (data.error) {
              setError(data.error);
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
      // Story is now stored in storyRef.current - user can tap Play to hear it
      if (storyRef.current.trim()) {
        setHasStory(true);
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

  const handlePlayStory = async () => {
    if (!storyRef.current.trim()) return;
    
    const cleanedStory = storyRef.current.replace(/\*/g, '').replace(/["'"]/g, '');
    
    if (ttsModel === 'kokoro') {
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
        }
      } catch (err) {
        console.error('Kokoro TTS error:', err);
        setError(err instanceof Error ? err.message : 'Failed to generate audio');
      } finally {
        setIsLoadingKokoro(false);
      }
    } else if (availableVoices.length > 0) {
      speechSynthesis.cancel();
      
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

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    speechSynthesis.cancel();
    setIsGenerating(false);
    setIsPlaying(false);
    setIsPaused(false);
  };

  const handlePause = () => {
    if (ttsModel === 'kokoro' && audioRef.current) {
      audioRef.current.pause();
    } else {
      speechSynthesis.pause();
    }
    setIsPaused(true);
  };

  const handleResume = () => {
    if (ttsModel === 'kokoro' && audioRef.current) {
      audioRef.current.play();
    } else {
      speechSynthesis.resume();
    }
    setIsPaused(false);
  };

  const handleRestart = async () => {
    if (!storyRef.current.trim()) return;
    
    const cleanedStory = storyRef.current.replace(/\*/g, '').replace(/["'"]/g, '');
    
    if (ttsModel === 'kokoro') {
      // Stop current audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setIsPaused(false);
      
      // Reload with Kokoro TTS
      setIsLoadingKokoro(true);
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
          };
          setIsPlaying(true);
          audio.play();
        }
      } catch (err) {
        console.error('Kokoro TTS error:', err);
        setError(err instanceof Error ? err.message : 'Failed to generate audio');
      } finally {
        setIsLoadingKokoro(false);
      }
    } else if (availableVoices.length > 0) {
      // Browser TTS
      speechSynthesis.cancel();
      setIsPaused(false);
      
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

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <button
          className="lg:hidden fixed bottom-20 right-4 z-50 flex items-center justify-center w-14 h-14 bg-purple-600/90 hover:bg-purple-600 text-white rounded-full shadow-lg transition-colors"
          data-testid="button-mobile-story"
        >
          <BookOpen className="h-6 w-6" />
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[70vh] bg-black/95 border-t border-white/10">
        <SheetHeader>
          <SheetTitle className="text-white flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-purple-400" />
            Story Reader
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 mt-4">
          <div className="space-y-2">
            <label className="text-sm text-white/70">Point of View</label>
            <div className="flex gap-2">
              <button
                onClick={() => setPov('first_person')}
                disabled={isGenerating || isPlaying}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 px-3 rounded-lg text-sm font-medium transition-colors ${
                  pov === 'first_person'
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-800 text-white/60'
                }`}
              >
                <User className="h-4 w-4" />
                My POV
              </button>
              <button
                onClick={() => setPov('character')}
                disabled={isGenerating || isPlaying}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 px-3 rounded-lg text-sm font-medium transition-colors ${
                  pov === 'character'
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-800 text-white/60'
                }`}
              >
                <Eye className="h-4 w-4" />
                Her POV
              </button>
              <button
                onClick={() => setPov('third_person')}
                disabled={isGenerating || isPlaying}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 px-3 rounded-lg text-sm font-medium transition-colors ${
                  pov === 'third_person'
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-800 text-white/60'
                }`}
              >
                <Users className="h-4 w-4" />
                3rd Person
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-white/70">Story Length</label>
            <div className="flex gap-2">
              <button
                onClick={() => { setStoryLength('short'); localStorage.setItem('storyLength', 'short'); }}
                disabled={isGenerating || isPlaying}
                className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-colors ${
                  storyLength === 'short'
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-700 text-white/60 hover:bg-slate-600'
                }`}
              >
                Short
              </button>
              <button
                onClick={() => { setStoryLength('medium'); localStorage.setItem('storyLength', 'medium'); }}
                disabled={isGenerating || isPlaying}
                className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-colors ${
                  storyLength === 'medium'
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-700 text-white/60 hover:bg-slate-600'
                }`}
              >
                Medium
              </button>
              <button
                onClick={() => { setStoryLength('long'); localStorage.setItem('storyLength', 'long'); }}
                disabled={isGenerating || isPlaying}
                className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-colors ${
                  storyLength === 'long'
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-700 text-white/60 hover:bg-slate-600'
                }`}
              >
                Long
              </button>
            </div>
          </div>

          <Dialog open={personaDialogOpen} onOpenChange={setPersonaDialogOpen}>
            <DialogTrigger asChild>
              <button
                disabled={isGenerating || isPlaying}
                className="w-full flex items-center justify-between py-3 px-4 rounded-lg bg-slate-800 text-white/80 text-sm hover:bg-slate-700 transition-colors"
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
              placeholder="Add story directions... e.g., 'she's my step-sister' or 'include dirty talk'"
              className="min-h-[80px] bg-slate-900/50 border-white/20 text-white placeholder:text-white/30 text-sm resize-none"
              disabled={isGenerating || isPlaying}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Mic className="h-4 w-4 text-white/70" />
              <div className="flex gap-1 flex-1">
                <button
                  onClick={() => setTtsModel('browser')}
                  disabled={isPlaying || isGenerating}
                  className={`flex-1 py-2 px-3 rounded text-sm font-medium transition-colors ${
                    ttsModel === 'browser'
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-700 text-white/60 hover:bg-slate-600'
                  }`}
                >
                  Browser
                </button>
                <button
                  onClick={() => setTtsModel('kokoro')}
                  disabled={isPlaying || isGenerating}
                  className={`flex-1 py-2 px-3 rounded text-sm font-medium transition-colors ${
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
                    if (isPlaying && storyRef.current.trim()) {
                      speechSynthesis.cancel();
                      setIsPaused(false);
                      setTimeout(() => {
                        const cleanedStory = storyRef.current.replace(/\*/g, '').replace(/["'"]/g, '');
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
                  disabled={isGenerating}
                  className="w-full bg-slate-800 text-white/80 text-sm p-3 rounded-lg border border-white/10"
                >
                  {availableVoices.map((voice, index) => (
                    <option key={index} value={index}>
                      {voice.name}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-white/50 text-sm">Loading voices...</p>
              )
            ) : (
              <select
                value={kokoroVoice}
                onChange={(e) => setKokoroVoice(e.target.value)}
                disabled={isPlaying || isGenerating}
                className="w-full bg-slate-800 text-white/80 text-sm p-3 rounded-lg border border-white/10"
              >
                {KOKORO_VOICES.map((voice) => (
                  <option key={voice.value} value={voice.value}>
                    {voice.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          {error && (
            <div className="text-red-400 text-sm p-3 bg-red-900/20 rounded-lg border border-red-500/30">
              {error}
            </div>
          )}

          <div className="flex gap-3 mt-2">
            {isGenerating ? (
              <Button
                onClick={handleStop}
                variant="destructive"
                className="flex-1 h-14 text-lg"
              >
                <Square className="h-5 w-5 mr-2" />
                Stop
              </Button>
            ) : isPlaying ? (
              <>
                <Button
                  onClick={isPaused ? handleResume : handlePause}
                  className="flex-1 h-14 text-lg bg-amber-600 hover:bg-amber-700"
                >
                  {isPaused ? (
                    <>
                      <Play className="h-5 w-5 mr-2" />
                      Resume
                    </>
                  ) : (
                    <>
                      <Pause className="h-5 w-5 mr-2" />
                      Pause
                    </>
                  )}
                </Button>
                <Button
                  onClick={handleRestart}
                  className="h-14 px-4 bg-blue-600 hover:bg-blue-700"
                >
                  <RotateCcw className="h-5 w-5" />
                </Button>
                <Button
                  onClick={handleStop}
                  variant="destructive"
                  className="h-14 px-4"
                >
                  <Square className="h-5 w-5" />
                </Button>
              </>
            ) : (
              <div className="flex gap-2 flex-1">
                <Button
                  onClick={handleGenerateStory}
                  disabled={!imagePrompt.trim() || isGenerating}
                  className="flex-1 h-14 text-lg bg-purple-600 hover:bg-purple-700"
                >
                  {isGenerating ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <BookOpen className="h-5 w-5 mr-2" />
                      Generate
                    </>
                  )}
                </Button>
                {hasStory && !isGenerating && (
                  <Button
                    onClick={handlePlayStory}
                    disabled={isLoadingKokoro || (ttsModel === 'browser' && availableVoices.length === 0)}
                    className="flex-1 h-14 text-lg bg-green-600 hover:bg-green-700"
                  >
                    {isLoadingKokoro ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        <Volume2 className="h-5 w-5 mr-2" />
                        Play
                      </>
                    )}
                  </Button>
                )}
              </div>
            )}
          </div>

          {isGenerating && (
            <div className="flex flex-col items-center justify-center gap-3 py-8">
              <Loader2 className="h-12 w-12 text-purple-400 animate-spin" />
              <span className="text-white/70 text-sm">Creating your story...</span>
            </div>
          )}

          {isLoadingKokoro && !isGenerating && (
            <div className="flex flex-col items-center justify-center gap-3 py-8">
              <Loader2 className="h-12 w-12 text-purple-400 animate-spin" />
              <span className="text-white/70 text-sm">Generating AI voice...</span>
            </div>
          )}

          {isPlaying && !isGenerating && !isLoadingKokoro && (
            <div className="flex items-center justify-center gap-2 text-purple-400 animate-pulse">
              <Volume2 className="h-5 w-5" />
              <span className="text-sm">Reading story aloud...</span>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
