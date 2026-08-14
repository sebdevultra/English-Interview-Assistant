import { GoogleGenAI } from 'https://esm.sh/@google/genai';

// Configuración del worker de PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Estado global de la aplicación
let apiKey = localStorage.getItem('gemini_api_key') || '';
let defaultPdfContext = '';
let customPdfContext = '';
let activePdfContext = '';
let activePdfName = 'contexto.pdf';
let chatSession = null;
let currentAiClient = null;
let currentSystemInstruction = '';
let isSpeechEnabled = true;
let currentActiveStopBtn = null;
let sessionHistory = []; // Almacena el historial para persistencia

// Estado de Grabación de Audio Multimodal (MediaRecorder)
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let recordingTimerInterval = null;
let recordingSeconds = 0;

// Estado de Previsualización de Audio
let pendingAudioBlob = null;
let pendingAudioUrl = null;
let pendingAudioBase64 = null;

// Elementos del DOM
const apiKeyInput = document.getElementById('api-key-input');
const saveKeyBtn = document.getElementById('save-key-btn');
const modelSelect = document.getElementById('model-select');
const chatModelSelect = document.getElementById('chat-model-select');
const startBtn = document.getElementById('start-btn');
const configSection = document.getElementById('config-section');
const chatSection = document.getElementById('chat-section');
const chatBox = document.getElementById('chat-box');
const chatForm = document.getElementById('chat-form');
const userInput = document.getElementById('user-input');
const statusBadge = document.getElementById('status-badge');
const metrics = document.getElementById('metrics');
const ttftVal = document.getElementById('ttft-val');
const totalVal = document.getElementById('total-val');

// Elementos de Audio & PDF UI
const ttsToggle = document.getElementById('tts-toggle');
const micBtn = document.getElementById('mic-btn');
const voiceIndicator = document.getElementById('voice-indicator');
const recordingTimer = document.getElementById('recording-timer');
const generateReportBtn = document.getElementById('generate-report-btn');
const exitToHomeBtn = document.getElementById('exit-to-home-btn');
const pdfSourceDefault = document.getElementById('pdf-source-default');
const pdfSourceCustom = document.getElementById('pdf-source-custom');
const customPdfInput = document.getElementById('custom-pdf-input');
const customPdfLabel = document.getElementById('custom-pdf-label');
const defaultPdfLabel = document.getElementById('default-pdf-label');
const customPdfName = document.getElementById('custom-pdf-name');

// Elementos de Previsualización de Audio
const audioPreviewContainer = document.getElementById('audio-preview-container');
const audioPreviewPlayer = document.getElementById('audio-preview-player');
const discardAudioBtn = document.getElementById('discard-audio-btn');
const confirmSendAudioBtn = document.getElementById('confirm-send-audio-btn');

// Elementos del Modal de Cambio de Key desde el Chat
const changeKeyChatBtn = document.getElementById('change-key-chat-btn');
const changeKeyModal = document.getElementById('change-key-modal');
const modalKeyInput = document.getElementById('modal-key-input');
const closeModalBtn = document.getElementById('close-modal-btn');
const cancelModalBtn = document.getElementById('cancel-modal-btn');
const saveModalKeyBtn = document.getElementById('save-modal-key-btn');

// Cargar API Key inicial si existe
if (apiKey) {
  apiKeyInput.value = apiKey;
}

// -------------------------------------------------------------
// 1. UTILIDADES DE CONVERSIÓN BINARIA / AUDIO
// -------------------------------------------------------------
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result.split(',')[1];
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64, mimeType = 'audio/webm') {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

// -------------------------------------------------------------
// 2. INGESTA Y PROCESAMIENTO DE PDF
// -------------------------------------------------------------
async function extractTextFromPDF(arrayBuffer) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(item => item.str).join(' ');
    fullText += pageText + '\n';
  }
  return fullText.trim();
}

async function loadDefaultPDF() {
  try {
    const response = await fetch('contexto.pdf');
    if (!response.ok) throw new Error("No se encontró 'contexto.pdf' en la raíz.");
    
    const arrayBuffer = await response.arrayBuffer();
    defaultPdfContext = await extractTextFromPDF(arrayBuffer);
    
    if (pdfSourceDefault.checked) {
      activePdfContext = defaultPdfContext;
      activePdfName = 'contexto.pdf (Automation & AI)';
    }
    checkReadyToStart();
    
    // Verificar si hay sesión previa guardada para restaurar
    restoreSessionIfAvailable();
  } catch (err) {
    statusBadge.textContent = 'Error al cargar PDF';
    statusBadge.className = 'px-3 py-1 text-xs rounded-full bg-red-500/10 text-red-400 border border-red-500/20';
    console.error('PDF Load Error:', err);
  }
}

// Manejador para PDF Personalizado
customPdfLabel.addEventListener('click', () => {
  pdfSourceCustom.checked = true;
  updatePdfSourceStyles();
  customPdfInput.click();
});

customPdfInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    statusBadge.textContent = 'Leyendo PDF subido...';
    statusBadge.className = 'px-3 py-1 text-xs rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20';
    
    const arrayBuffer = await file.arrayBuffer();
    customPdfContext = await extractTextFromPDF(arrayBuffer);
    activePdfContext = customPdfContext;
    activePdfName = file.name;
    
    customPdfName.textContent = `✓ ${file.name} (${(file.size / 1024).toFixed(0)} KB)`;
    customPdfName.classList.add('text-emerald-400', 'font-medium');
    
    pdfSourceCustom.checked = true;
    updatePdfSourceStyles();
    checkReadyToStart();
  } catch (err) {
    alert("Error al procesar el archivo PDF: " + err.message);
    console.error(err);
  }
});

pdfSourceDefault.addEventListener('change', () => {
  activePdfContext = defaultPdfContext;
  activePdfName = 'contexto.pdf (Automation & AI)';
  updatePdfSourceStyles();
  checkReadyToStart();
});

pdfSourceCustom.addEventListener('change', () => {
  if (customPdfContext) {
    activePdfContext = customPdfContext;
  }
  updatePdfSourceStyles();
  checkReadyToStart();
});

function updatePdfSourceStyles() {
  if (pdfSourceDefault.checked) {
    defaultPdfLabel.className = 'border-2 border-indigo-500/80 bg-indigo-950/30 p-3.5 rounded-xl flex items-center gap-3 cursor-pointer transition';
    customPdfLabel.className = 'border border-slate-700 bg-slate-900/60 p-3.5 rounded-xl flex items-center gap-3 cursor-pointer hover:border-slate-600 transition';
  } else {
    customPdfLabel.className = 'border-2 border-indigo-500/80 bg-indigo-950/30 p-3.5 rounded-xl flex items-center gap-3 cursor-pointer transition';
    defaultPdfLabel.className = 'border border-slate-700 bg-slate-900/60 p-3.5 rounded-xl flex items-center gap-3 cursor-pointer hover:border-slate-600 transition';
  }
}

// -------------------------------------------------------------
// 3. PERSISTENCIA EN LOCALSTORAGE & CAMBIO DE MODELO EN VIVO
// -------------------------------------------------------------
function checkReadyToStart() {
  if (apiKey && activePdfContext) {
    startBtn.disabled = false;
    statusBadge.textContent = 'Todo listo ✓';
    statusBadge.className = 'px-3 py-1 text-xs rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
  } else if (!apiKey && activePdfContext) {
    statusBadge.textContent = 'Ingresa tu API Key';
    statusBadge.className = 'px-3 py-1 text-xs rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20';
  } else if (apiKey && !activePdfContext) {
    statusBadge.textContent = 'Cargando PDF...';
    statusBadge.className = 'px-3 py-1 text-xs rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20';
  }
}

// Guardar API Key desde pantalla de inicio
saveKeyBtn.addEventListener('click', (e) => {
  e.preventDefault();
  const key = apiKeyInput.value.trim();
  if (!key) {
    alert('Por favor ingresa una API Key válida.');
    return;
  }
  
  apiKey = key;
  localStorage.setItem('gemini_api_key', apiKey);
  
  saveKeyBtn.textContent = '¡Guardado! ✓';
  saveKeyBtn.classList.remove('bg-slate-800');
  saveKeyBtn.classList.add('bg-emerald-800', 'text-emerald-200');
  
  setTimeout(() => {
    saveKeyBtn.textContent = 'Guardar Key';
    saveKeyBtn.classList.remove('bg-emerald-800', 'text-emerald-200');
    saveKeyBtn.classList.add('bg-slate-800');
  }, 2000);

  checkReadyToStart();
});

// Guardar estado de la sesión en localStorage
function saveSessionToLocalStorage() {
  if (!sessionHistory || sessionHistory.length === 0) return;
  const currentModel = chatModelSelect ? chatModelSelect.value : (modelSelect ? modelSelect.value : 'gemini-3.7-flash');
  const sessionData = {
    activePdfName,
    activePdfContext,
    selectedModel: currentModel,
    sessionHistory,
    timestamp: Date.now()
  };
  localStorage.setItem('active_interview_session', JSON.stringify(sessionData));
}

// Función centralizada para instanciar la sesión de chat con parámetros deterministas
function createChatSession(model, history = []) {
  buildSystemInstruction();
  const targetModel = model || (chatModelSelect ? chatModelSelect.value : (modelSelect ? modelSelect.value : 'gemini-3.7-flash'));
  
  return currentAiClient.chats.create({
    model: targetModel,
    history: history,
    config: {
      systemInstruction: currentSystemInstruction,
      temperature: 0.0,
      topP: 0.0,
      seed: 42
    }
  });
}

// Cambio de modelo en caliente desde la barra del chat
if (chatModelSelect) {
  chatModelSelect.addEventListener('change', () => {
    const newModel = chatModelSelect.value;
    if (modelSelect) modelSelect.value = newModel;
    
    if (currentAiClient && sessionHistory.length > 0) {
      const geminiHistory = sessionHistory.map(item => ({
        role: item.role === 'user' ? 'user' : 'model',
        parts: [{ text: item.text || '[Spoken Audio Submission]' }]
      }));

      chatSession = createChatSession(newModel, geminiHistory);

      saveSessionToLocalStorage();
      appendSystemNotification(`Modelo actualizado a <strong>${newModel}</strong> sin interrumpir la entrevista ✓`);
    }
  });
}

// Notificación visual del sistema en el chat
function appendSystemNotification(htmlText) {
  const notifDiv = document.createElement('div');
  notifDiv.className = 'flex justify-center my-2';
  notifDiv.innerHTML = `
    <div class="bg-indigo-950/70 border border-indigo-500/30 text-indigo-200 px-3.5 py-1.5 rounded-full text-xs flex items-center gap-1.5 shadow-sm">
      <span>🤖</span>
      <span>${htmlText}</span>
    </div>
  `;
  chatBox.appendChild(notifDiv);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// Restaurar sesión previa si el usuario recarga la página
function restoreSessionIfAvailable() {
  const saved = localStorage.getItem('active_interview_session');
  if (!saved || !apiKey) return;

  try {
    const sessionData = JSON.parse(saved);
    if (!sessionData.sessionHistory || sessionData.sessionHistory.length === 0) return;

    activePdfName = sessionData.activePdfName || activePdfName;
    activePdfContext = sessionData.activePdfContext || activePdfContext;
    if (sessionData.selectedModel) {
      if (modelSelect) modelSelect.value = sessionData.selectedModel;
      if (chatModelSelect) chatModelSelect.value = sessionData.selectedModel;
    }
    sessionHistory = sessionData.sessionHistory;

    // Reconstruir interfaz del chat
    chatBox.innerHTML = '';
    const geminiHistory = [];

    sessionHistory.forEach(item => {
      if (item.role === 'user') {
        let audioUrl = item.audioUrl;
        if (item.audioBase64) {
          const blob = base64ToBlob(item.audioBase64, item.audioMimeType || 'audio/webm');
          audioUrl = URL.createObjectURL(blob);
        }
        appendMessage('user', item.text, audioUrl, item.audioBase64, item.audioMimeType);
        geminiHistory.push({
          role: 'user',
          parts: [{ text: item.text || '[Spoken Audio Response]' }]
        });
      } else {
        const { contentElement, stopBtn, replayBtn } = appendMessage('model', item.text);
        replayBtn.addEventListener('click', () => speakText(item.text, stopBtn));
        geminiHistory.push({
          role: 'model',
          parts: [{ text: item.text }]
        });
      }
    });

    // Reconstruir sesión de chat en Gemini con el historial completo
    currentAiClient = new GoogleGenAI({ apiKey });
    const currentModel = chatModelSelect ? chatModelSelect.value : (modelSelect ? modelSelect.value : 'gemini-3.7-flash');
    chatSession = createChatSession(currentModel, geminiHistory);

    // Mostrar chat
    configSection.classList.add('hidden');
    chatSection.classList.remove('hidden');

  } catch (err) {
    console.error('Error al restaurar sesión previa:', err);
    localStorage.removeItem('active_interview_session');
  }
}

// -------------------------------------------------------------
// 4. CAMBIO DE API KEY DESDE LA VISTA DEL CHAT
// -------------------------------------------------------------
changeKeyChatBtn.addEventListener('click', () => {
  modalKeyInput.value = apiKey || '';
  changeKeyModal.classList.remove('hidden');
});

closeModalBtn.addEventListener('click', () => {
  changeKeyModal.classList.add('hidden');
});

cancelModalBtn.addEventListener('click', () => {
  changeKeyModal.classList.add('hidden');
});

saveModalKeyBtn.addEventListener('click', () => {
  const newKey = modalKeyInput.value.trim();
  if (!newKey) {
    alert('Por favor ingresa una API Key válida.');
    return;
  }

  apiKey = newKey;
  localStorage.setItem('gemini_api_key', apiKey);
  apiKeyInput.value = apiKey;

  // Re-instanciar cliente y chat de Gemini con la nueva Key sin perder historial
  currentAiClient = new GoogleGenAI({ apiKey });
  
  const geminiHistory = sessionHistory.map(item => ({
    role: item.role === 'user' ? 'user' : 'model',
    parts: [{ text: item.text || '[Spoken Audio Submission]' }]
  }));

  const currentModel = chatModelSelect ? chatModelSelect.value : (modelSelect ? modelSelect.value : 'gemini-3.7-flash');
  chatSession = createChatSession(currentModel, geminiHistory);

  changeKeyModal.classList.add('hidden');
  appendSystemNotification('API Key actualizada con éxito ✓ Puedes continuar tu entrevista.');
});

// -------------------------------------------------------------
// 5. SÍNTESIS DE VOZ (TEXT-TO-SPEECH)
// -------------------------------------------------------------
ttsToggle.addEventListener('change', (e) => {
  isSpeechEnabled = e.target.checked;
  if (!isSpeechEnabled) {
    stopSpeaking();
  }
});

function stopSpeaking() {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  if (currentActiveStopBtn) {
    currentActiveStopBtn.classList.add('hidden');
    currentActiveStopBtn = null;
  }
}

function speakText(text, stopBtnElement = null) {
  if (!isSpeechEnabled || !window.speechSynthesis) return;
  
  stopSpeaking();

  const cleanText = text
    .replace(/[#*_`~>-]/g, '')
    .replace(/---/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\[(.*?)\]/g, '$1')
    .trim();

  if (!cleanText) return;

  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.lang = 'en-US';
  utterance.rate = 1.0;
  utterance.pitch = 1.0;

  const voices = window.speechSynthesis.getVoices();
  const naturalEnVoice = voices.find(v => (v.lang.startsWith('en-US') || v.lang.startsWith('en')) && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Samantha') || v.name.includes('Daniel')));
  if (naturalEnVoice) {
    utterance.voice = naturalEnVoice;
  }

  utterance.onstart = () => {
    if (stopBtnElement) {
      currentActiveStopBtn = stopBtnElement;
      stopBtnElement.classList.remove('hidden');
    }
  };

  utterance.onend = () => {
    if (stopBtnElement) {
      stopBtnElement.classList.add('hidden');
    }
    if (currentActiveStopBtn === stopBtnElement) {
      currentActiveStopBtn = null;
    }
  };

  utterance.onerror = () => {
    if (stopBtnElement) {
      stopBtnElement.classList.add('hidden');
    }
    if (currentActiveStopBtn === stopBtnElement) {
      currentActiveStopBtn = null;
    }
  };

  window.speechSynthesis.speak(utterance);
}

// -------------------------------------------------------------
// 6. GRABACIÓN DE AUDIO MULTIMODAL & PREVISUALIZACIÓN
// -------------------------------------------------------------
function updateRecordingTimerDisplay() {
  recordingSeconds++;
  const mins = String(Math.floor(recordingSeconds / 60)).padStart(2, '0');
  const secs = String(recordingSeconds % 60).padStart(2, '0');
  recordingTimer.textContent = `${mins}:${secs}`;
}

async function startAudioRecording() {
  try {
    stopSpeaking();
    clearPendingAudio();
    audioChunks = [];
    recordingSeconds = 0;
    recordingTimer.textContent = '00:00';

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    const mimeTypes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
      'audio/wav'
    ];
    let selectedMimeType = '';
    for (const mime of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mime)) {
        selectedMimeType = mime;
        break;
      }
    }

    mediaRecorder = selectedMimeType ? new MediaRecorder(stream, { mimeType: selectedMimeType }) : new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      clearInterval(recordingTimerInterval);
      stream.getTracks().forEach(track => track.stop());

      if (audioChunks.length === 0) return;

      pendingAudioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
      pendingAudioUrl = URL.createObjectURL(pendingAudioBlob);
      pendingAudioBase64 = await blobToBase64(pendingAudioBlob);

      audioPreviewPlayer.src = pendingAudioUrl;
      audioPreviewContainer.classList.remove('hidden');
    };

    mediaRecorder.start(250);
    isRecording = true;

    micBtn.classList.remove('bg-slate-800', 'text-indigo-400');
    micBtn.classList.add('bg-red-600', 'text-white', 'animate-pulse');
    voiceIndicator.classList.remove('hidden');

    recordingTimerInterval = setInterval(updateRecordingTimerDisplay, 1000);

  } catch (err) {
    alert("No se pudo acceder al micrófono: " + err.message);
    console.error('Error accessing microphone:', err);
    stopAudioRecordingUI();
  }
}

function stopAudioRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  stopAudioRecordingUI();
}

function stopAudioRecordingUI() {
  isRecording = false;
  clearInterval(recordingTimerInterval);
  micBtn.classList.remove('bg-red-600', 'text-white', 'animate-pulse');
  micBtn.classList.add('bg-slate-800', 'text-indigo-400');
  voiceIndicator.classList.add('hidden');
}

function clearPendingAudio() {
  if (audioPreviewPlayer) {
    audioPreviewPlayer.pause();
    audioPreviewPlayer.currentTime = 0;
    audioPreviewPlayer.src = '';
  }
  if (pendingAudioUrl) {
    URL.revokeObjectURL(pendingAudioUrl);
  }
  pendingAudioBlob = null;
  pendingAudioUrl = null;
  pendingAudioBase64 = null;
  audioPreviewContainer.classList.add('hidden');
}

// Botón Micrófono
micBtn.addEventListener('click', () => {
  if (isRecording) {
    stopAudioRecording();
  } else {
    startAudioRecording();
  }
});

// Botón Descartar Grabación
discardAudioBtn.addEventListener('click', () => {
  clearPendingAudio();
});

// Botón Confirmar y Enviar Audio a Gemini
confirmSendAudioBtn.addEventListener('click', async () => {
  if (!pendingAudioBlob || !pendingAudioBase64) return;

  if (audioPreviewPlayer) {
    audioPreviewPlayer.pause();
    audioPreviewPlayer.currentTime = 0;
  }

  const audioToSendUrl = pendingAudioUrl;
  const audioToSendBlob = pendingAudioBlob;
  const audioToSendBase64 = pendingAudioBase64;
  const audioMimeType = audioToSendBlob.type || 'audio/webm';

  audioPreviewContainer.classList.add('hidden');

  appendMessage('user', '', audioToSendUrl, audioToSendBase64, audioMimeType);

  // Guardar en historial de sesión con el Base64 para permitir reenvío y recargas
  sessionHistory.push({
    role: 'user',
    text: '[Respuesta de voz grabada]',
    audioUrl: audioToSendUrl,
    audioBase64: audioToSendBase64,
    audioMimeType: audioMimeType
  });
  saveSessionToLocalStorage();

  const multimodalPayload = [
    {
      inlineData: {
        mimeType: audioMimeType,
        data: audioToSendBase64
      }
    },
    {
      text: `[SPOKEN AUDIO SUBMISSION]
The candidate answered the interview question by speaking in the provided audio file.
Listen carefully to their voice, pronunciation, grammar, vocabulary, and delivery pacing.
Provide structured feedback following the strict system instructions:
1. Technical Content & Grammar accuracy
2. Spoken Pronunciation, Phonetics & Accent Clarity (highlight mispronounced words with phonetic guidance)
3. Delivery, Pacing, Confidence & Filler Words
4. Next Question`
    }
  ];

  pendingAudioBlob = null;
  pendingAudioUrl = null;
  pendingAudioBase64 = null;

  await sendMessage(multimodalPayload);
});

// Función para Reenviar un Audio previamente grabado
async function resendExistingAudio(audioBase64, audioMimeType) {
  if (!audioBase64) return;

  stopSpeaking();
  clearPendingAudio();

  const blob = base64ToBlob(audioBase64, audioMimeType || 'audio/webm');
  const audioUrl = URL.createObjectURL(blob);

  appendMessage('user', '', audioUrl, audioBase64, audioMimeType);

  sessionHistory.push({
    role: 'user',
    text: '[Audio Reenviado]',
    audioUrl: audioUrl,
    audioBase64: audioBase64,
    audioMimeType: audioMimeType
  });
  saveSessionToLocalStorage();

  const multimodalPayload = [
    {
      inlineData: {
        mimeType: audioMimeType || 'audio/webm',
        data: audioBase64
      }
    },
    {
      text: `[RE-SUBMITTED SPOKEN AUDIO]
The candidate re-sent this audio answer for evaluation.
Listen carefully to their voice, pronunciation, grammar, vocabulary, and delivery pacing.
Provide structured feedback following the strict system instructions:
1. Technical Content & Grammar accuracy
2. Spoken Pronunciation, Phonetics & Accent Clarity (highlight mispronounced words with phonetic guidance)
3. Delivery, Pacing, Confidence & Filler Words
4. Next Question`
    }
  ];

  await sendMessage(multimodalPayload);
}

// -------------------------------------------------------------
// 7. ORQUESTACIÓN DE GEMINI Y ENTREVISTA
// -------------------------------------------------------------
function buildSystemInstruction() {
  currentSystemInstruction = `
    You are an elite Senior Technical Recruiter and Engineering Manager from top Silicon Valley tech giants (Google, NVIDIA, Apple, Microsoft, Amazon, GitLab, Stripe).
    You are interviewing a candidate for a remote software engineering vacancy (Automation & AI Developer / Full-stack Developer). 
    
    JOB DESCRIPTION / CONTEXT:
    ${activePdfContext}
    
    ROLE & MULTIMODAL EVALUATION:
    - The candidate will respond EITHER by typing text OR by speaking directly via audio recordings.
    - When an AUDIO file is provided, you MUST listen to their voice and evaluate both technical correctness AND acoustic pronunciation, phonetics, accent clarity, intonation, and rhythm.
    - Push the candidate toward C1-level executive English fluency.

    SESSION OPENING PROTOCOL (FIRST TURN ONLY):
    - When you receive the START_INTERVIEW_CALL directive, act as the lead interviewer welcoming the candidate into the call.
    - Welcome the candidate warmly, introduce yourself as the Engineering Manager / Technical Interviewer, mention the vacancy role from the context, briefly outline what the session will cover, and ask the classic opening question: "To kick things off, could you please introduce yourself and walk me through your technical background and recent projects?".
    - DO NOT include any feedback sections (### 🎯 Technical Content or ### 🗣️ Pronunciation) in this initial welcome greeting.

    STRICT FORMAT RULES (FOR EVERY ONGOING TURN AFTER THE CANDIDATE REPLIES):
    
    ### 🎯 Technical Content & Grammar
    - **Technical Accuracy:** Evaluate the candidate's engineering concept, problem-solving, and vocabulary.
    - **Grammar & Phrasing:** Highlight awkward phrasing or grammatical errors in **bold** and suggest professional alternatives in *italics*.
    
    ### 🗣️ Pronunciation, Phonetics & Delivery
    - **Pronunciation & Phonetics:** (If audio was sent) Identify mispronounced technical or common words. Provide phonetic guides (e.g., *Async* -> /ˈeɪ.sɪŋk/, *Variables* -> /ˈvɛər.i.ə.bəlz/, *-ed* past endings: /t/, /d/, /ɪd/). If text was sent, provide 1 tip on how to pronounce key technical terms used in the answer.
    - **Vocal Delivery & Cadence:** Comment on pacing, confidence, intonation, and eliminate spoken filler words (*"uhm", "like", "you know"*).
    
    ---
    
    ### 💬 Next Question
    - Ask exactly **ONE** clear, engaging interview question. 
    - Alternate logically between system design scenarios, coding practices, behavioral questions, and context requirements.
    
    ---------------------------------------------------------
    
    EXCEPTION FOR WRAP-UP (When concluding interview or on request):
    
    ### 🏁 Final Assessment & Score
    - **Estimated English Level:** (e.g., B1, B2, C1)
    - **Hiring Recommendation:** (Strong Hire / Hire / Lean Hire / Needs Practice)
    - **Overall Communication Score:** (1 to 10)
    
    ---
    
    ### 📊 Comprehensive Strengths & Action Plan
    - Group overall grammar, technical clarity, and acoustic pronunciation areas for improvement into clear bullet points.
    - Inspiring closing statement from a hiring manager's perspective.
  `;
}

startBtn.addEventListener('click', async () => {
  try {
    startBtn.disabled = true;
    startBtn.textContent = 'Iniciando sesión con Gemini...';

    const selectedModel = modelSelect ? modelSelect.value : 'gemini-3.7-flash';
    if (chatModelSelect) chatModelSelect.value = selectedModel;
    
    currentAiClient = new GoogleGenAI({ apiKey });

    // Creación de la sesión con los parámetros deterministas centralizados
    chatSession = createChatSession(selectedModel, []);

    sessionHistory = [];
    chatBox.innerHTML = '';

    configSection.classList.add('hidden');
    chatSection.classList.remove('hidden');

    await sendMessage("START_INTERVIEW_CALL: Open the interview call now. Greet the candidate, introduce yourself and the role, and ask the opening question.");
  } catch (err) {
    alert("Error al iniciar con Gemini API: " + err.message);
    startBtn.disabled = false;
    startBtn.textContent = '🚀 Iniciar Entrevista';
    console.error(err);
  }
});

// Botón 1: Generar Reporte Final y Evaluación
generateReportBtn.addEventListener('click', async () => {
  if (confirm('¿Deseas concluir la sesión de entrevista y generar tu reporte final de evaluación con puntaje y feedback?')) {
    appendMessage('user', 'Please conclude the interview and provide my comprehensive evaluation report.');
    sessionHistory.push({
      role: 'user',
      text: 'Please conclude the interview and provide my comprehensive evaluation report.'
    });
    saveSessionToLocalStorage();
    await sendMessage('Please conclude the interview now and provide my final score and comprehensive evaluation report.');
  }
});

// Botón 2: Salir y volver a la pantalla de inicio
exitToHomeBtn.addEventListener('click', () => {
  if (confirm('¿Deseas salir y volver a la pantalla de configuración? (Se borrará el historial de la entrevista actual)')) {
    stopSpeaking();
    stopAudioRecording();
    clearPendingAudio();
    chatSession = null;
    sessionHistory = [];
    localStorage.removeItem('active_interview_session');
    chatBox.innerHTML = '';
    userInput.value = '';
    metrics.classList.add('hidden');
    chatSection.classList.add('hidden');
    configSection.classList.remove('hidden');
    startBtn.disabled = false;
    startBtn.textContent = '🚀 Iniciar Entrevista';
  }
});

// Submit del formulario de chat (Texto Escrito)
chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (isRecording) {
    stopAudioRecording();
    return;
  }

  const text = userInput.value.trim();
  if (!text) return;

  userInput.value = '';
  stopSpeaking();
  clearPendingAudio();
  appendMessage('user', text);

  sessionHistory.push({
    role: 'user',
    text
  });
  saveSessionToLocalStorage();

  await sendMessage(text);
});

// Envío de mensajes y streaming a Gemini
async function sendMessage(payload) {
  const { contentElement, stopBtn, replayBtn } = appendMessage('model', '');
  const startTime = performance.now();
  let firstTokenTime = null;

  try {
    const responseStream = await chatSession.sendMessageStream({ message: payload });

    let fullText = '';
    for await (const chunk of responseStream) {
      if (!firstTokenTime) {
        firstTokenTime = performance.now();
      }
      fullText += chunk.text;
      
      contentElement.innerHTML = window.marked ? window.marked.parse(fullText) : fullText;
      chatBox.scrollTop = chatBox.scrollHeight;
    }

    const endTime = performance.now();
    const ttft = firstTokenTime ? ((firstTokenTime - startTime) / 1000).toFixed(2) : '0';
    const totalTime = ((endTime - startTime) / 1000).toFixed(2);

    metrics.classList.remove('hidden');
    ttftVal.textContent = `${ttft} s`;
    totalVal.textContent = `${totalTime} s`;

    sessionHistory.push({
      role: 'model',
      text: fullText
    });
    saveSessionToLocalStorage();

    replayBtn.addEventListener('click', () => {
      speakText(fullText, stopBtn);
    });

    speakText(fullText, stopBtn);

  } catch (err) {
    console.error('Gemini Send Error:', err);
    let errMsg = err.message;
    
    if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota')) {
      contentElement.innerHTML = `
        <div class="bg-amber-950/60 border border-amber-800/60 rounded-xl p-3 text-amber-200 text-xs space-y-2">
          <p class="font-bold">⚠️ Se ha alcanzado el límite de tokens / cuota de tu API Key actual.</p>
          <p>Puedes cambiar tu API Key de Google AI Studio sin perder esta conversación:</p>
          <button type="button" onclick="document.getElementById('change-key-chat-btn').click()" class="bg-amber-600 hover:bg-amber-500 text-white font-medium px-3 py-1.5 rounded-lg transition text-xs">
            🔑 Ingresar Nueva API Key
          </button>
        </div>
      `;
    } else {
      contentElement.textContent = `Error en la comunicación con Gemini: ${errMsg}`;
    }
  }
}

// Renderizado de burbujas en el chat
function appendMessage(sender, text, audioUrl = null, audioBase64 = null, audioMimeType = 'audio/webm') {
  const msgDiv = document.createElement('div');
  const bubble = document.createElement('div');
  
  if (sender === 'user') {
    msgDiv.className = 'flex justify-end';
    bubble.className = 'bg-indigo-600 text-white rounded-2xl py-3 px-4 max-w-[85%] prose prose-invert text-sm shadow-md flex flex-col gap-2';
    
    if (audioUrl) {
      bubble.innerHTML = `
        <div class="flex items-center justify-between gap-3 text-xs font-semibold text-indigo-100 not-prose">
          <span class="flex items-center gap-1.5">
            <span>🎙️</span>
            <span>Tu respuesta de voz</span>
          </span>
          <button type="button" class="resend-audio-btn text-[11px] bg-indigo-700/80 hover:bg-indigo-800 text-white px-2 py-0.5 rounded border border-indigo-400/40 transition flex items-center gap-1 cursor-pointer shadow-sm">
            <span>🔄 Reenviar</span>
          </button>
        </div>
        <audio controls src="${audioUrl}" class="w-full max-w-xs h-9 rounded-lg my-1 accent-white"></audio>
      `;

      const resendBtn = bubble.querySelector('.resend-audio-btn');
      if (resendBtn && audioBase64) {
        resendBtn.addEventListener('click', () => {
          if (confirm('¿Deseas reenviar esta grabación de audio para que Gemini la vuelva a evaluar?')) {
            resendExistingAudio(audioBase64, audioMimeType);
          }
        });
      }
    } else {
      bubble.textContent = text;
    }

    msgDiv.appendChild(bubble);
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
    return bubble;

  } else {
    msgDiv.className = 'flex justify-start';
    bubble.className = 'bg-slate-900 text-slate-100 rounded-2xl p-4 max-w-[88%] border border-slate-800 prose prose-invert prose-p:my-1 prose-ul:my-1 prose-headings:my-2 text-sm shadow-md flex flex-col gap-2';

    const headerBar = document.createElement('div');
    headerBar.className = 'flex items-center justify-between pb-2 mb-1 border-b border-slate-800/80 not-prose';

    const leftGroup = document.createElement('div');
    leftGroup.className = 'flex items-center gap-2';

    const avatarLabel = document.createElement('span');
    avatarLabel.className = 'text-xs font-semibold text-indigo-400 flex items-center gap-1';
    avatarLabel.innerHTML = '<span>🤖 Reclutador AI</span>';

    const stopMsgBtn = document.createElement('button');
    stopMsgBtn.type = 'button';
    stopMsgBtn.className = 'hidden text-[11px] bg-red-950/90 hover:bg-red-900 text-red-300 hover:text-red-200 px-2 py-0.5 rounded border border-red-800/60 transition flex items-center gap-1 shadow-sm animate-pulse';
    stopMsgBtn.innerHTML = '<span>⏹️ Detener Voz</span>';
    stopMsgBtn.addEventListener('click', () => {
      stopSpeaking();
    });

    leftGroup.appendChild(avatarLabel);
    leftGroup.appendChild(stopMsgBtn);

    const replayMsgBtn = document.createElement('button');
    replayMsgBtn.type = 'button';
    replayMsgBtn.className = 'text-[11px] text-indigo-400 hover:text-indigo-300 bg-slate-800/80 hover:bg-slate-800 px-2 py-0.5 rounded border border-slate-700 transition flex items-center gap-1';
    replayMsgBtn.innerHTML = '<span>🔊 Escuchar</span>';

    headerBar.appendChild(leftGroup);
    headerBar.appendChild(replayMsgBtn);

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.innerHTML = text ? (window.marked ? window.marked.parse(text) : text) : '<span class="animate-pulse text-indigo-400">Analizando tu respuesta y pronunciación...</span>';

    bubble.appendChild(headerBar);
    bubble.appendChild(contentDiv);

    msgDiv.appendChild(bubble);
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;

    return { contentElement: contentDiv, stopBtn: stopMsgBtn, replayBtn: replayMsgBtn };
  }
}

// Cargar el PDF inicial por defecto y restaurar sesión
loadDefaultPDF();
