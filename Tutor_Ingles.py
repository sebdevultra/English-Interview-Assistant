import os
from google import genai
from pypdf import PdfReader
from dotenv import load_dotenv
import time

load_dotenv()
# 1. Cargar el documento (Retrieval manual sencillo)
def cargar_contexto_pdf(ruta_pdf):
    reader = PdfReader(ruta_pdf)
    texto = ""
    for page in reader.pages:
        texto += page.extract_text()
    return texto

# 2. Configurar el Tutor
def main():
    client = genai.Client()
    ruta = r"C:\Users\SEBAS\Desktop\Ruta_avanzada_IA\Desarrollo\Sistemas\semana3\Tutor_Ingles_Entrevistas\contexto.pdf"
    # Cargamos el contexto de tu PDF (ej: descripción del cargo de Scrum Master)
    contexto_entrevista = cargar_contexto_pdf(ruta)

    chat = client.chats.create(
        model="gemini-3.6-flash",
        config={
            "system_instruction": f"""
            You are a professional English recruiter from company like GOOGLE, NVIDIA, Apple, Microsoft, Amazon, Zapier, GitLab, SumatoSoft or GitHub. 
            You are looking for a Automation and AI Semi-Senior developer for a remote job, with SOFT, HARD and ENGLISH skills.
            Use the following JOB DESCRIPTION as context: {contexto_entrevista}            
            Your goal is to conduct a mock interview in English. 
            - Ask one question at a time.
            - Provide feedback on the user's English level (target: C1-C2).
            - Focus on the technical requirements mentioned in the context.
            """
        }
    )
    print("=" * 55)
    print("--- Interview Practice Started  ---")
    print("   Escribe 'salir', 'exit' o 'quit' para cerrar.")
    print("=" * 55 + "\n")

    while True:
        try:
            # 1. Captura de entrada (FUERA del cronómetro)
            user_input = input("Tú >>> ").strip()

            if not user_input:
                continue

            if user_input.lower() in ["salir", "exit", "quit"]:
                print("\n👋 Sesión finalizada. Memoria eliminada.")
                break

            print("Gemini >>> ", end="", flush=True)

            # 2. INICIO DE MEDICIÓN (Justo antes de llamar a la API)
            start_time = time.perf_counter()
            first_token_time = None

            response = chat.send_message_stream(user_input)

            for chunk in response:
                # Captura el tiempo en que llega la primera palabra (TTFT)
                if first_token_time is None:
                    first_token_time = time.perf_counter()
                
                print(chunk.text, end="", flush=True)

            # 3. FIN DE MEDICIÓN
            end_time = time.perf_counter()

            # Cálculo de métricas
            ttft = (first_token_time - start_time) if first_token_time else 0
            total_time = end_time - start_time

            print("\n" + "─" * 40)
            print(f"⏱️  Primer token (TTFT) : {ttft:.2f} s")
            print(f"⏱️  Tiempo total stream : {total_time:.2f} s")
            print("─" * 40 + "\n")

        except KeyboardInterrupt:
            print("\n\n👋 Sesión interrumpida por teclado.")
            break
        except Exception as e:
            print(f"\n❌ Ocurrió un error: {e}\n")

if __name__ == "__main__":
    main()
   
