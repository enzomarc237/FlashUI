
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

//Vibe coded by ammaar@google.com

import { GoogleGenAI } from '@google/genai';
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import ReactDOM from 'react-dom/client';

import { Artifact, Session, ComponentVariation, LayoutOption, SavedComponent, Theme } from './types';
import { INITIAL_PLACEHOLDERS } from './constants';
import { generateId, withRetry } from './utils';

import DottedGlowBackground from './components/DottedGlowBackground';
import ArtifactCard from './components/ArtifactCard';
import SideDrawer from './components/SideDrawer';
import { 
    ThinkingIcon, 
    CodeIcon, 
    SparklesIcon, 
    ArrowLeftIcon, 
    ArrowRightIcon, 
    ArrowUpIcon, 
    GridIcon,
    DownloadIcon,
    EditIcon,
    LibraryIcon,
    SaveIcon,
    TrashIcon,
    SunIcon,
    MoonIcon,
    ContrastIcon,
    FileTextIcon
} from './components/Icons';

function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionIndex, setCurrentSessionIndex] = useState<number>(-1);
  const [focusedArtifactIndex, setFocusedArtifactIndex] = useState<number | null>(null);
  
  const [inputValue, setInputValue] = useState<string>('');
  const [librarySearchQuery, setLibrarySearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [placeholders, setPlaceholders] = useState<string[]>(INITIAL_PLACEHOLDERS);
  
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('flash_ui_theme') as Theme) || 'dark';
  });

  const [drawerState, setDrawerState] = useState<{
      isOpen: boolean;
      mode: 'code' | 'variations' | 'edit-css' | 'library' | 'save-dialog' | 'export-options' | null;
      title: string;
      data: any; 
  }>({ isOpen: false, mode: null, title: '', data: null });

  const [componentVariations, setComponentVariations] = useState<ComponentVariation[]>([]);
  const [library, setLibrary] = useState<SavedComponent[]>(() => {
      const saved = localStorage.getItem('flash_ui_library');
      return saved ? JSON.parse(saved) : [];
  });

  const [saveForm, setSaveForm] = useState({ name: '', category: 'General' });

  const inputRef = useRef<HTMLInputElement>(null);
  const gridScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      localStorage.setItem('flash_ui_library', JSON.stringify(library));
  }, [library]);

  useEffect(() => {
    localStorage.setItem('flash_ui_theme', theme);
    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
      inputRef.current?.focus();
  }, []);

  // Fix for mobile: reset scroll when focusing an item to prevent "overscroll" state
  useEffect(() => {
    if (focusedArtifactIndex !== null && window.innerWidth <= 1024) {
        if (gridScrollRef.current) {
            gridScrollRef.current.scrollTop = 0;
        }
        window.scrollTo(0, 0);
    }
  }, [focusedArtifactIndex]);

  // Cycle placeholders
  useEffect(() => {
      const interval = setInterval(() => {
          setPlaceholderIndex(prev => (prev + 1) % placeholders.length);
      }, 3000);
      return () => clearInterval(interval);
  }, [placeholders.length]);

  // Dynamic placeholder generation on load
  useEffect(() => {
      const fetchDynamicPlaceholders = async () => {
          try {
              const apiKey = process.env.API_KEY;
              if (!apiKey) return;
              const ai = new GoogleGenAI({ apiKey });
              const response = await withRetry(() => ai.models.generateContent({
                  model: 'gemini-3-flash-preview',
                  contents: { 
                      role: 'user', 
                      parts: [{ 
                          text: 'Generate 20 creative, short, diverse UI component prompts (e.g. "bioluminescent task list"). Return ONLY a raw JSON array of strings. IP SAFEGUARD: Avoid referencing specific famous artists, movies, or brands.' 
                      }] 
                  }
              }));
              const text = response.text || '[]';
              const jsonMatch = text.match(/\[[\s\S]*\]/);
              if (jsonMatch) {
                  const newPlaceholders = JSON.parse(jsonMatch[0]);
                  if (Array.isArray(newPlaceholders) && newPlaceholders.length > 0) {
                      const shuffled = newPlaceholders.sort(() => 0.5 - Math.random()).slice(0, 10);
                      setPlaceholders(prev => [...prev, ...shuffled]);
                  }
              }
          } catch (e) {
              console.warn("Silently failed to fetch dynamic placeholders", e);
          }
      };
      setTimeout(fetchDynamicPlaceholders, 1000);
  }, []);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(event.target.value);
  };

  const parseJsonStream = async function* (responseStream: AsyncGenerator<{ text: string }>) {
      let buffer = '';
      for await (const chunk of responseStream) {
          const text = chunk.text;
          if (typeof text !== 'string') continue;
          buffer += text;
          let braceCount = 0;
          let start = buffer.indexOf('{');
          while (start !== -1) {
              braceCount = 0;
              let end = -1;
              for (let i = start; i < buffer.length; i++) {
                  if (buffer[i] === '{') braceCount++;
                  else if (buffer[i] === '}') braceCount--;
                  if (braceCount === 0 && i > start) {
                      end = i;
                      break;
                  }
              }
              if (end !== -1) {
                  const jsonString = buffer.substring(start, end + 1);
                  try {
                      yield JSON.parse(jsonString);
                      buffer = buffer.substring(end + 1);
                      start = buffer.indexOf('{');
                  } catch (e) {
                      start = buffer.indexOf('{', start + 1);
                  }
              } else {
                  break; 
              }
          }
      }
  };

  const nextItem = useCallback(() => {
      if (focusedArtifactIndex !== null) {
          if (focusedArtifactIndex < 2) setFocusedArtifactIndex(focusedArtifactIndex + 1);
      } else {
          if (currentSessionIndex < sessions.length - 1) setCurrentSessionIndex(currentSessionIndex + 1);
      }
  }, [currentSessionIndex, sessions.length, focusedArtifactIndex]);

  const prevItem = useCallback(() => {
      if (focusedArtifactIndex !== null) {
          if (focusedArtifactIndex > 0) setFocusedArtifactIndex(focusedArtifactIndex - 1);
      } else {
           if (currentSessionIndex > 0) setCurrentSessionIndex(currentSessionIndex - 1);
      }
  }, [currentSessionIndex, focusedArtifactIndex]);

  // Global keyboard navigation
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input or textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'ArrowLeft') {
        prevItem();
      } else if (e.key === 'ArrowRight') {
        nextItem();
      } else if (e.key === 'Escape' && focusedArtifactIndex !== null) {
        setFocusedArtifactIndex(null);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [prevItem, nextItem, focusedArtifactIndex]);

  const handleGenerateVariations = useCallback(async () => {
    const currentSession = sessions[currentSessionIndex];
    if (!currentSession || focusedArtifactIndex === null) return;
    const currentArtifact = currentSession.artifacts[focusedArtifactIndex];

    setIsLoading(true);
    setComponentVariations([]);
    setDrawerState({ isOpen: true, mode: 'variations', title: 'Variations', data: currentArtifact.id });

    try {
        const apiKey = process.env.API_KEY;
        if (!apiKey) throw new Error("API_KEY is not configured.");
        const ai = new GoogleGenAI({ apiKey });

        const prompt = `
You are a master UI/UX designer. Generate 3 RADICAL CONCEPTUAL VARIATIONS of: "${currentSession.prompt}".

**STRICT IP SAFEGUARD:**
No names of artists. 
Instead, describe the *Physicality* and *Material Logic* of the UI.

**CREATIVE GUIDANCE (Use these as EXAMPLES of how to describe style, but INVENT YOUR OWN):**
1. Example: "Asymmetrical Primary Grid" (Heavy black strokes, rectilinear structure, flat primary pigments, high-contrast white space).
2. Example: "Suspended Kinetic Mobile" (Delicate wire-thin connections, floating organic primary shapes, slow-motion balance, white-void background).
3. Example: "Grainy Risograph Press" (Overprinted translucent inks, dithered grain textures, monochromatic color depth, raw paper substrate).
4. Example: "Volumetric Spectral Fluid" (Generative morphing gradients, soft-focus diffusion, bioluminescent light sources, spectral chromatic aberration).

**YOUR TASK:**
For EACH variation:
- Invent a unique design persona name based on a NEW physical metaphor.
- Rewrite the prompt to fully adopt that metaphor's visual language.
- Generate high-fidelity HTML/CSS.

Required JSON Output Format (stream ONE object per line):
\`{ "name": "Persona Name", "html": "..." }\`
        `.trim();

        const responseStream = await withRetry(() => ai.models.generateContentStream({
            model: 'gemini-3-flash-preview',
             contents: [{ parts: [{ text: prompt }], role: 'user' }],
             config: { temperature: 1.2 }
        }));

        for await (const variation of parseJsonStream(responseStream)) {
            if (variation.name && variation.html) {
                setComponentVariations(prev => [...prev, variation]);
            }
        }
    } catch (e: any) {
        console.error("Error generating variations:", e);
    } finally {
        setIsLoading(false);
    }
  }, [sessions, currentSessionIndex, focusedArtifactIndex]);

  const applyVariation = (html: string) => {
      if (focusedArtifactIndex === null) return;
      setSessions(prev => prev.map((sess, i) => 
          i === currentSessionIndex ? {
              ...sess,
              artifacts: sess.artifacts.map((art, j) => 
                j === focusedArtifactIndex ? { ...art, html, status: 'complete' } : art
              )
          } : sess
      ));
      setDrawerState(s => ({ ...s, isOpen: false }));
  };

  const handleShowCode = () => {
      const currentSession = sessions[currentSessionIndex];
      if (currentSession && focusedArtifactIndex !== null) {
          const artifact = currentSession.artifacts[focusedArtifactIndex];
          setDrawerState({ isOpen: true, mode: 'code', title: 'Source Code', data: artifact.html });
      }
  };

  const extractCSS = (html: string) => {
      const match = html.match(/<style>([\s\S]*?)<\/style>/);
      return match ? match[1].trim() : '';
  };

  const extractHTMLBody = (html: string) => {
      return html.replace(/<style>([\s\S]*?)<\/style>/, '').trim();
  };

  const injectCSS = (html: string, newCSS: string) => {
      if (html.includes('<style>')) {
          return html.replace(/<style>([\s\S]*?)<\/style>/, `<style>\n${newCSS}\n</style>`);
      } else {
          return `<style>\n${newCSS}\n</style>\n${html}`;
      }
  };

  const handleEditCSS = () => {
      const currentSession = sessions[currentSessionIndex];
      if (currentSession && focusedArtifactIndex !== null) {
          const artifact = currentSession.artifacts[focusedArtifactIndex];
          const css = extractCSS(artifact.html);
          setDrawerState({ isOpen: true, mode: 'edit-css', title: 'Edit Styles', data: css });
      }
  };

  const handleCSSChange = (newCSS: string) => {
      if (focusedArtifactIndex === null) return;
      setSessions(prev => prev.map((sess, i) => 
          i === currentSessionIndex ? {
              ...sess,
              artifacts: sess.artifacts.map((art, j) => 
                  j === focusedArtifactIndex ? { ...art, html: injectCSS(art.html, newCSS) } : art
              )
          } : sess
      ));
  };

  const handleOpenSaveDialog = () => {
    const currentSession = sessions[currentSessionIndex];
    if (currentSession && focusedArtifactIndex !== null) {
        const artifact = currentSession.artifacts[focusedArtifactIndex];
        setSaveForm({ name: artifact.styleName, category: 'General' });
        setDrawerState({ isOpen: true, mode: 'save-dialog', title: 'Save to Library', data: null });
    }
  };

  const handleSaveToLibrary = () => {
      const currentSession = sessions[currentSessionIndex];
      if (currentSession && focusedArtifactIndex !== null) {
          const artifact = currentSession.artifacts[focusedArtifactIndex];
          const newSaved: SavedComponent = {
              id: generateId(),
              name: saveForm.name || artifact.styleName,
              category: saveForm.category || 'General',
              html: artifact.html,
              timestamp: Date.now()
          };
          setLibrary(prev => [newSaved, ...prev]);
          setDrawerState(s => ({ ...s, isOpen: false }));
      }
  };

  const handleOpenLibrary = () => {
      setLibrarySearchQuery('');
      setDrawerState({ isOpen: true, mode: 'library', title: 'Component Library', data: library });
  };

  const handleDeleteSaved = (id: string) => {
      setLibrary(prev => prev.filter(c => c.id !== id));
  };

  const handleOpenExportDialog = () => {
      const currentSession = sessions[currentSessionIndex];
      if (currentSession && focusedArtifactIndex !== null) {
          setDrawerState({ isOpen: true, mode: 'export-options', title: 'Export Options', data: null });
      }
  };

  const downloadFile = (content: string, filename: string, type: string) => {
      const blob = new Blob([content], { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  const handleExportSingle = () => {
    const currentSession = sessions[currentSessionIndex];
    if (currentSession && focusedArtifactIndex !== null) {
        const artifact = currentSession.artifacts[focusedArtifactIndex];
        downloadFile(artifact.html, `flash-ui-${artifact.styleName.toLowerCase().replace(/\s+/g, '-')}.html`, 'text/html');
    }
  };

  const handleExportBundle = () => {
    const currentSession = sessions[currentSessionIndex];
    if (currentSession && focusedArtifactIndex !== null) {
        const artifact = currentSession.artifacts[focusedArtifactIndex];
        const css = extractCSS(artifact.html);
        const html = extractHTMLBody(artifact.html);
        const baseName = `flash-ui-${artifact.styleName.toLowerCase().replace(/\s+/g, '-')}`;
        
        // In a real separate file export, HTML would link to CSS. 
        const htmlFileContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <link rel="stylesheet" href="style.css">
</head>
<body>
    ${html}
</body>
</html>`;
        
        downloadFile(htmlFileContent, `${baseName}.html`, 'text/html');
        downloadFile(css, `style.css`, 'text/css');
        alert("Both files downloaded separately. Place them in the same folder.");
    }
  };

  const handleSendMessage = useCallback(async (manualPrompt?: string) => {
    const promptToUse = manualPrompt || inputValue;
    const trimmedInput = promptToUse.trim();
    
    if (!trimmedInput || isLoading) return;
    if (!manualPrompt) setInputValue('');

    setIsLoading(true);
    const baseTime = Date.now();
    const sessionId = generateId();

    const placeholderArtifacts: Artifact[] = Array(3).fill(null).map((_, i) => ({
        id: `${sessionId}_${i}`,
        styleName: 'Designing...',
        html: '',
        status: 'streaming',
    }));

    const newSession: Session = {
        id: sessionId,
        prompt: trimmedInput,
        timestamp: baseTime,
        artifacts: placeholderArtifacts
    };

    setSessions(prev => [...prev, newSession]);
    setCurrentSessionIndex(sessions.length); 
    setFocusedArtifactIndex(null); 

    try {
        const apiKey = process.env.API_KEY;
        if (!apiKey) throw new Error("API_KEY is not configured.");
        const ai = new GoogleGenAI({ apiKey });

        const stylePrompt = `
Generate 3 distinct, highly evocative design directions for: "${trimmedInput}".

**STRICT IP SAFEGUARD:**
Never use artist or brand names. Use physical and material metaphors.

**CREATIVE EXAMPLES (Do not simply copy these, use them as a guide for tone):**
- Example A: "Asymmetrical Rectilinear Blockwork" (Grid-heavy, primary pigments, thick structural strokes, Bauhaus-functionalism vibe).
- Example B: "Grainy Risograph Layering" (Tactile paper texture, overprinted translucent inks, dithered gradients).
- Example C: "Kinetic Wireframe Suspension" (Floating silhouettes, thin balancing lines, organic primary shapes).
- Example D: "Spectral Prismatic Diffusion" (Glassmorphism, caustic refraction, soft-focus morphing gradients).

**GOAL:**
Return ONLY a raw JSON array of 3 *NEW*, creative names for these directions (e.g. ["Tactile Risograph Press", "Kinetic Silhouette Balance", "Primary Pigment Gridwork"]).
        `.trim();

        const styleResponse = await withRetry(() => ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: { role: 'user', parts: [{ text: stylePrompt }] }
        }));

        let generatedStyles: string[] = [];
        const styleText = styleResponse.text || '[]';
        const jsonMatch = styleText.match(/\[[\s\S]*\]/);
        
        if (jsonMatch) {
            try {
                generatedStyles = JSON.parse(jsonMatch[0]);
            } catch (e) {
                console.warn("Failed to parse styles, using fallbacks");
            }
        }

        if (!generatedStyles || generatedStyles.length < 3) {
            generatedStyles = [
                "Primary Pigment Gridwork",
                "Tactile Risograph Layering",
                "Kinetic Silhouette Balance"
            ];
        }
        
        generatedStyles = generatedStyles.slice(0, 3);

        setSessions(prev => prev.map(s => {
            if (s.id !== sessionId) return s;
            return {
                ...s,
                artifacts: s.artifacts.map((art, i) => ({
                    ...art,
                    styleName: generatedStyles[i]
                }))
            };
        }));

        const generateArtifact = async (artifact: Artifact, styleInstruction: string) => {
            try {
                const prompt = `
You are Flash UI. Create a stunning, high-fidelity UI component for: "${trimmedInput}".

**CONCEPTUAL DIRECTION: ${styleInstruction}**

**VISUAL EXECUTION RULES:**
1. **Materiality**: Use the specified metaphor to drive every CSS choice. (e.g. if Risograph, use \`feTurbulence\` for grain and \`mix-blend-mode: multiply\` for ink layering).
2. **Typography**: Use high-quality web fonts. Pair a bold sans-serif with a refined monospace for data.
3. **Motion**: Include subtle, high-performance CSS/JS animations (hover transitions, entry reveals).
4. **IP SAFEGUARD**: No artist names or trademarks. 
5. **Layout**: Be bold with negative space and hierarchy. Avoid generic cards.

Return ONLY RAW HTML. No markdown fences.
          `.trim();
          
                const responseStream = await withRetry(() => ai.models.generateContentStream({
                    model: 'gemini-3-flash-preview',
                    contents: [{ parts: [{ text: prompt }], role: "user" }],
                }));

                let accumulatedHtml = '';
                for await (const chunk of responseStream) {
                    const text = chunk.text;
                    if (typeof text === 'string') {
                        accumulatedHtml += text;
                        setSessions(prev => prev.map(sess => 
                            sess.id === sessionId ? {
                                ...sess,
                                artifacts: sess.artifacts.map(art => 
                                    art.id === artifact.id ? { ...art, html: accumulatedHtml } : art
                                )
                            } : sess
                        ));
                    }
                }
                
                let finalHtml = accumulatedHtml.trim();
                if (finalHtml.startsWith('```html')) finalHtml = finalHtml.substring(7).trimStart();
                if (finalHtml.startsWith('```')) finalHtml = finalHtml.substring(3).trimStart();
                if (finalHtml.endsWith('```')) finalHtml = finalHtml.substring(0, finalHtml.length - 3).trimEnd();

                setSessions(prev => prev.map(sess => 
                    sess.id === sessionId ? {
                        ...sess,
                        artifacts: sess.artifacts.map(art => 
                            art.id === artifact.id ? { ...art, html: finalHtml, status: finalHtml ? 'complete' : 'error' } : art
                        )
                    } : sess
                ));

            } catch (e: any) {
                console.error('Error generating artifact:', e);
                const isRateLimit = e?.message?.includes('429') || e?.message?.includes('RESOURCE_EXHAUSTED');
                const errorMsg = isRateLimit 
                    ? "Rate limit exceeded. Try again in a few seconds." 
                    : `Error: ${e.message}`;

                setSessions(prev => prev.map(sess => 
                    sess.id === sessionId ? {
                        ...sess,
                        artifacts: sess.artifacts.map(art => 
                            art.id === artifact.id ? { ...art, html: `<div style="color: #ff6b6b; padding: 20px;">${errorMsg}</div>`, status: 'error' } : art
                        )
                    } : sess
                ));
            }
        };

        await Promise.all(placeholderArtifacts.map((art, i) => generateArtifact(art, generatedStyles[i])));

    } catch (e: any) {
        console.error("Fatal error in generation process", e);
        // Provide visual feedback even for fatal errors
        setIsLoading(false);
    } finally {
        setIsLoading(false);
        setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [inputValue, isLoading, sessions.length]);

  const handleSurpriseMe = () => {
      const currentPrompt = placeholders[placeholderIndex];
      setInputValue(currentPrompt);
      handleSendMessage(currentPrompt);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !isLoading) {
      event.preventDefault();
      handleSendMessage();
    } else if (event.key === 'Tab' && !inputValue && !isLoading) {
        event.preventDefault();
        setInputValue(placeholders[placeholderIndex]);
    }
  };

  const cycleTheme = () => {
    const themes: Theme[] = ['dark', 'light', 'high-contrast'];
    const nextIndex = (themes.indexOf(theme) + 1) % themes.length;
    setTheme(themes[nextIndex]);
  };

  const isLoadingDrawer = isLoading && drawerState.mode === 'variations' && componentVariations.length === 0;

  const hasStarted = sessions.length > 0 || isLoading;
  const currentSession = sessions[currentSessionIndex];

  let canGoBack = false;
  let canGoForward = false;

  if (hasStarted) {
      if (focusedArtifactIndex !== null) {
          canGoBack = focusedArtifactIndex > 0;
          canGoForward = focusedArtifactIndex < (currentSession?.artifacts.length || 0) - 1;
      } else {
          canGoBack = currentSessionIndex > 0;
          canGoForward = currentSessionIndex < sessions.length - 1;
      }
  }

  const filteredLibrary = useMemo(() => {
      if (!librarySearchQuery.trim()) return library;
      const query = librarySearchQuery.toLowerCase();
      return library.filter(comp => 
          comp.name.toLowerCase().includes(query) || 
          comp.category.toLowerCase().includes(query)
      );
  }, [library, librarySearchQuery]);

  const groupedLibrary = useMemo(() => {
      return filteredLibrary.reduce((acc, comp) => {
          const cat = comp.category || 'General';
          if (!acc[cat]) acc[cat] = [];
          acc[cat].push(comp);
          return acc;
      }, {} as Record<string, SavedComponent[]>);
  }, [filteredLibrary]);

  const handleLibraryItemClick = (comp: SavedComponent) => {
    if (focusedArtifactIndex !== null) {
        applyVariation(comp.html);
    } else {
        handleSendMessage(comp.name);
    }
    setDrawerState(s => ({...s, isOpen: false}));
  };

  const getThemeIcon = () => {
    if (theme === 'light') return <SunIcon />;
    if (theme === 'high-contrast') return <ContrastIcon />;
    return <MoonIcon />;
  };

  return (
    <>
        <div className="top-nav-bar">
            <div className="nav-left">
              <a href="https://x.com/ammaar" target="_blank" rel="noreferrer" className={`creator-credit-nav ${hasStarted ? 'hide-on-mobile' : ''}`}>
                  created by @ammaar
              </a>
              <button className="theme-nav-toggle" onClick={cycleTheme} title="Change Theme">
                  {getThemeIcon()}
              </button>
            </div>
            <button className="library-nav-toggle" onClick={handleOpenLibrary}>
                <LibraryIcon /> Library ({library.length})
            </button>
        </div>

        <SideDrawer 
            isOpen={drawerState.isOpen} 
            onClose={() => setDrawerState(s => ({...s, isOpen: false}))} 
            title={drawerState.title}
        >
            {isLoadingDrawer && (
                 <div className="loading-state">
                     <ThinkingIcon /> 
                     Designing variations...
                 </div>
            )}

            {drawerState.mode === 'code' && (
                <pre className="code-block"><code>{drawerState.data}</code></pre>
            )}

            {drawerState.mode === 'edit-css' && (
                <div className="css-editor-container">
                    <p className="editor-hint">Changes apply instantly to the focused component.</p>
                    <textarea 
                        className="css-textarea"
                        value={sessions[currentSessionIndex]?.artifacts[focusedArtifactIndex!] ? extractCSS(sessions[currentSessionIndex].artifacts[focusedArtifactIndex!].html) : ''}
                        onChange={(e) => handleCSSChange(e.target.value)}
                        spellCheck={false}
                    />
                </div>
            )}
            
            {drawerState.mode === 'variations' && (
                <div className="sexy-grid">
                    {componentVariations.map((v, i) => (
                         <div key={i} className="sexy-card" onClick={() => applyVariation(v.html)}>
                             <div className="sexy-preview">
                                 <iframe srcDoc={v.html} title={v.name} sandbox="allow-scripts allow-same-origin" />
                             </div>
                             <div className="sexy-label">{v.name}</div>
                         </div>
                    ))}
                </div>
            )}

            {drawerState.mode === 'save-dialog' && (
                <div className="save-dialog-form">
                    <div className="form-group">
                        <label>Component Name</label>
                        <input 
                            type="text" 
                            value={saveForm.name} 
                            onChange={(e) => setSaveForm(prev => ({ ...prev, name: e.target.value }))}
                            placeholder="e.g. My Awesome Card"
                        />
                    </div>
                    <div className="form-group">
                        <label>Category</label>
                        <input 
                            type="text" 
                            value={saveForm.category} 
                            onChange={(e) => setSaveForm(prev => ({ ...prev, category: e.target.value }))}
                            placeholder="e.g. Cards, Buttons, Layouts"
                        />
                    </div>
                    <button className="confirm-save-btn" onClick={handleSaveToLibrary}>
                        Confirm Save
                    </button>
                </div>
            )}

            {drawerState.mode === 'export-options' && (
                <div className="export-dialog">
                    <p className="export-hint">Choose your preferred format for exporting the code.</p>
                    <div className="export-buttons-stack">
                        <button className="export-option-btn" onClick={handleExportSingle}>
                            <div className="export-icon"><FileTextIcon /></div>
                            <div className="export-info">
                                <strong>Single HTML File</strong>
                                <span>Includes embedded CSS styles. Easy to share.</span>
                            </div>
                        </button>
                        <button className="export-option-btn" onClick={handleExportBundle}>
                            <div className="export-icon"><CodeIcon /></div>
                            <div className="export-info">
                                <strong>Code Bundle (Separate Files)</strong>
                                <span>Download HTML and CSS as separate files. Professional.</span>
                            </div>
                        </button>
                    </div>
                </div>
            )}

            {drawerState.mode === 'library' && (
                <div className="library-container">
                    <div className="library-search-wrapper">
                        <input 
                            type="text" 
                            className="library-search-input"
                            placeholder="Search by name or category..."
                            value={librarySearchQuery}
                            onChange={(e) => setLibrarySearchQuery(e.target.value)}
                        />
                    </div>
                    {filteredLibrary.length === 0 ? (
                        <div className="empty-library-msg">
                            {library.length === 0 
                                ? "Your library is empty. Save components from the action bar."
                                : "No components match your search."}
                        </div>
                    ) : (
                        Object.entries(groupedLibrary).map(([cat, comps]) => (
                            <div key={cat} className="library-section">
                                <h3 className="library-section-title">{cat}</h3>
                                <div className="library-items-grid">
                                    {(comps as SavedComponent[]).map((v) => (
                                        <div key={v.id} className="sexy-card library-card large-preview" onClick={() => handleLibraryItemClick(v)}>
                                            <div className="sexy-preview interactive-preview">
                                                <iframe srcDoc={v.html} title={v.name} sandbox="allow-scripts allow-same-origin" />
                                            </div>
                                            <div className="sexy-label mini">
                                                <span>{v.name}</span>
                                                <button className="delete-saved-btn" onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteSaved(v.id);
                                                }} title="Delete from library">
                                                    <TrashIcon />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </SideDrawer>

        <div className="immersive-app">
            <DottedGlowBackground 
                gap={24} 
                radius={1.5} 
                color={theme === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255, 255, 255, 0.02)'} 
                glowColor={theme === 'light' ? 'rgba(0,0,0,0.1)' : 'rgba(255, 255, 255, 0.15)'} 
                speedScale={0.5} 
            />

            <div className={`stage-container ${focusedArtifactIndex !== null ? 'mode-focus' : 'mode-split'}`}>
                 <div className={`empty-state ${hasStarted ? 'fade-out' : ''}`}>
                     <div className="empty-content">
                         <h1>Flash UI</h1>
                         <p>Creative UI generation in a flash</p>
                         <button className="surprise-button" onClick={handleSurpriseMe} disabled={isLoading}>
                             <SparklesIcon /> Surprise Me
                         </button>
                     </div>
                 </div>

                {sessions.map((session, sIndex) => {
                    let positionClass = 'hidden';
                    if (sIndex === currentSessionIndex) positionClass = 'active-session';
                    else if (sIndex < currentSessionIndex) positionClass = 'past-session';
                    else if (sIndex > currentSessionIndex) positionClass = 'future-session';
                    
                    return (
                        <div key={session.id} className={`session-group ${positionClass}`}>
                            <div className="artifact-grid" ref={sIndex === currentSessionIndex ? gridScrollRef : null}>
                                {session.artifacts.map((artifact, aIndex) => {
                                    const isFocused = focusedArtifactIndex === aIndex;
                                    
                                    return (
                                        <ArtifactCard 
                                            key={artifact.id}
                                            index={aIndex}
                                            artifact={artifact}
                                            isFocused={isFocused}
                                            onClick={() => setFocusedArtifactIndex(aIndex)}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>

             {canGoBack && (
                <button className="nav-handle left" onClick={prevItem} aria-label="Previous">
                    <ArrowLeftIcon />
                </button>
             )}
             {canGoForward && (
                <button className="nav-handle right" onClick={nextItem} aria-label="Next">
                    <ArrowRightIcon />
                </button>
             )}

            <div className={`action-bar ${focusedArtifactIndex !== null ? 'visible' : ''}`}>
                 <div className="active-prompt-label">
                    {currentSession?.prompt}
                 </div>
                 <div className="action-buttons">
                    <button onClick={() => setFocusedArtifactIndex(null)}>
                        <GridIcon /> Grid View
                    </button>
                    <button onClick={handleGenerateVariations} disabled={isLoading}>
                        <SparklesIcon /> Variations
                    </button>
                    <button onClick={handleEditCSS}>
                        <EditIcon /> Edit CSS
                    </button>
                    <button onClick={handleShowCode}>
                        <CodeIcon /> Source
                    </button>
                    <button onClick={handleOpenExportDialog}>
                        <DownloadIcon /> Export
                    </button>
                    <button onClick={handleOpenSaveDialog} className="save-btn">
                        <SaveIcon /> Save
                    </button>
                 </div>
            </div>

            <div className="floating-input-container">
                <div className={`input-wrapper ${isLoading ? 'loading' : ''}`}>
                    {(!inputValue && !isLoading) && (
                        <div className="animated-placeholder" key={placeholderIndex}>
                            <span className="placeholder-text">{placeholders[placeholderIndex]}</span>
                            <span className="tab-hint">Tab</span>
                        </div>
                    )}
                    {!isLoading ? (
                        <input 
                            ref={inputRef}
                            type="text" 
                            value={inputValue} 
                            onChange={handleInputChange} 
                            onKeyDown={handleKeyDown} 
                            disabled={isLoading} 
                        />
                    ) : (
                        <div className="input-generating-label">
                            <span className="generating-prompt-text">{currentSession?.prompt}</span>
                            <ThinkingIcon />
                        </div>
                    )}
                    <button className="send-button" onClick={() => handleSendMessage()} disabled={isLoading || !inputValue.trim()}>
                        <ArrowUpIcon />
                    </button>
                </div>
            </div>
        </div>
    </>
  );
}

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<React.StrictMode><App /></React.StrictMode>);
}
