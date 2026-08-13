import { GoogleGenAI } from 'https://esm.sh/@google/genai';

// Configuración del worker de PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Estado global de la aplicación
let apiKey = localStorage.getItem('gemini_api_key') || '';
let pdfContext = '';
let chatSession = null;

// Elementos del DOM
const apiKeyInput = document.getElementById('api-key-input');
const saveKeyBtn = document.getElementById('save-key-btn');
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

// Cargar API Key inicial si existe
if (apiKey) {
  apiKeyInput.value = apiKey;
}

// Carga y extracción de texto desde el PDF
async function loadEmbeddedPDF() {
  try {
    const response = await fetch('contexto.pdf');
    if (!response.ok) throw new Error("No se encontró 'contexto.pdf' en la raíz.");
    
    const arrayBuffer = await response.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + '\n';
    }

    pdfContext = fullText.trim();
    checkReadyToStart();

  } catch (err) {
    statusBadge.textContent = 'Error al cargar PDF';
    statusBadge.className = 'px-3 py-1 text-xs rounded-full bg-red-500/10 text-red-400 border border-red-500/20';
    console.error('PDF Load Error:', err);
  }
}

// Validación centralizada del estado de preparación
function checkReadyToStart() {
  if (apiKey && pdfContext) {
    startBtn.disabled = false;
    statusBadge.textContent = 'Todo listo ✓';
    statusBadge.className = 'px-3 py-1 text-xs rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
  } else if (!apiKey && pdfContext) {
    statusBadge.textContent = 'Ingresa tu API Key';
    statusBadge.className = 'px-3 py-1 text-xs rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20';
  } else if (apiKey && !pdfContext) {
    statusBadge.textContent = 'Cargando PDF...';
    statusBadge.className = 'px-3 py-1 text-xs rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20';
  }
}

// Evento Guardar Key
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

// Evento Iniciar Entrevista
startBtn.addEventListener('click', async () => {
  try {
    startBtn.disabled = true;
    startBtn.textContent = 'Iniciando sesión con Gemini...';

    const ai = new GoogleGenAI({ apiKey });

    const systemInstruction = `
      You are a professional English recruiter from top tech companies (e.g., Google, NVIDIA, Apple, Microsoft, Amazon, Zapier, GitLab, GitHub).
      You are searching for a Semi-Senior or Junior developer for a remote job (Front-end, Back-end, or Full-stack). 
      You are testing their SOFT, HARD, and ENGLISH communication skills.
      
      Use the following JOB DESCRIPTION as context:
      ${pdfContext}
      
      ROLE & GOAL:
      Conduct a realistic, interactive mock technical interview in English. 
      Adapt your evaluation to the candidate's level (Junior/Semi-Senior), but gently push their English usage toward a professional corporate level (B2/C1).
      The first message that the user sends you is an automatic response so you can start the interview without giving them feedback and corrections.

      OUTPUT FORMATTING RULES (STRICT):
      1. DO NOT return dense walls or monoliths of text. Keep sentences short, direct, sharp, and dynamic.
      2. Use Markdown formatting heavily to make answers highly scannable:
         - **Bold** key terms, core technologies, and critical metrics.
         - Use bullet points (* or -) for actionable advice, grammar corrections, or lists.
         - Separate sections with a horizontal rule (---).
      3. For every ongoing user response, you MUST structure your answer into exactly two distinct sections. Never merge them:
         
         ### 🎯 Feedback & Corrections
         - Evaluate the user's previous answer (Grammar, Vocabulary, Tone, and Clarity).
         - Highlight mistakes or weak phrasing in **bold** and suggest professional alternatives in *italics*.
         - Give a brief, actionable tip on how a tech recruiter prefers to hear that specific point.
         
         ---
         
         ### 💬 Next Question
         - Ask exactly **ONE** clear, well-structured interview question.
         - Alternate logically between soft skills, technical scenarios, and past experience based on the job description. Do not ask multiple questions at once.
      
      4. END OF THE INTERVIEW EXCEPTION:
         When you decide to end the interview, DO NOT use the "Next Question" section. Instead, structure your final response using this exact format:
         
         ### 🏁 Interview Wrap-Up & Final Score
         - Provide a concise summary of the candidate's overall performance.
         - Give an approximate English level observed (e.g., B1, B2, C1) and a tech readiness assessment.
         
         ---
         
         ### 📊 Comprehensive Feedback Report
         - Group the overall grammar corrections, vocabulary improvements, and soft/hard skill advice into distinct, bulleted categories.
         - End with a motivating closing statement from a recruiter's perspective.
    `;

    // CORRECCIÓN SDK: Modelo oficial corregido
    chatSession = ai.chats.create({
      model: 'gemini-1.5-pro',
      config: { systemInstruction }
    });

    configSection.classList.add('hidden');
    chatSection.classList.remove('hidden');

    await sendMessage("Hello! I am ready to start the interview.");
  } catch (err) {
    alert("Error al iniciar con Gemini API: " + err.message);
    startBtn.disabled = false;
    startBtn.textContent = 'Iniciar Entrevista';
    console.error(err);
  }
});

// Manejo del submit del chat
chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = userInput.value.trim();
  if (!text) return;

  userInput.value = '';
  appendMessage('user', text);
  await sendMessage(text);
});

// Función de envío de mensajes en streaming
async function sendMessage(text) {
  const messageElement = appendMessage('model', '');
  const startTime = performance.now();
  let firstTokenTime = null;

  try {
    const responseStream = await chatSession.sendMessageStream({ message: text });

    let fullText = '';
    for await (const chunk of responseStream) {
      if (!firstTokenTime) {
        firstTokenTime = performance.now();
      }
      fullText += chunk.text;
      
      // Renderizado progresivo de Markdown
      messageElement.innerHTML = window.marked ? window.marked.parse(fullText) : fullText;
      chatBox.scrollTop = chatBox.scrollHeight;
    }

    const endTime = performance.now();
    
    const ttft = firstTokenTime ? ((firstTokenTime - startTime) / 1000).toFixed(2) : '0';
    const totalTime = ((endTime - startTime) / 1000).toFixed(2);

    metrics.classList.remove('hidden');
    ttftVal.textContent = `${ttft} s`;
    totalVal.textContent = `${totalTime} s`;

  } catch (err) {
    messageElement.textContent = `Error en el flujo de comunicación: ${err.message}`;
    console.error(err);
  }
}

// Utilidad para renderizar mensajes en el chat
function appendMessage(sender, text) {
  const msgDiv = document.createElement('div');
  const bubble = document.createElement('div');
  
  if (sender === 'user') {
    msgDiv.className = 'flex justify-end';
    bubble.className = 'bg-indigo-600 text-white rounded-xl py-3 px-4 max-w-[85%] prose prose-invert text-sm';
    bubble.textContent = text;
  } else {
    msgDiv.className = 'flex justify-start';
    bubble.className = 'bg-slate-800 text-slate-100 rounded-xl py-3 px-5 max-w-[85%] border border-slate-700 prose prose-invert prose-p:my-1 prose-ul:my-1 prose-headings:my-2 text-sm';
    bubble.innerHTML = text ? (window.marked ? window.marked.parse(text) : text) : '<span class="animate-pulse">Escribiendo...</span>';
  }

  msgDiv.appendChild(bubble);
  chatBox.appendChild(msgDiv);
  chatBox.scrollTop = chatBox.scrollHeight;

  return bubble;
}

// Inicialización de la aplicación
loadEmbeddedPDF();
