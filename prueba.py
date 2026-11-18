from google import genai

client = genai.Client()

response = client.models.generate_content(
    model="gemini-3.8-flash",
    contents="Dame 3 ideas de contenido para Instagram de un contador.",
)
print(response.text)