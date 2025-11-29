0. Run the relevant LLM Model e.g. Ollama3.1
1. Start ngrok to expose local server and n8n port 5678
```bash
ngrok http 5678
```

2. Start n8n locally
```bash
WEBHOOK_URL=<URL given by ngrok> n8n start
```

3. Launch n8n editor UI: 

    a) press 'o' in terminal 

    OR
    
    b) visit http://localhost:5678 
    
    OR

    c) visit the ngrok URL

4. Test Niyati n8n workflow from n8n editor:
- Access token needs to be set in node:
    - Click [Generate access token](https://developers.facebook.com/apps/806374342289213/use_cases/customize/wa-dev-console/?use_case_enum=WHATSAPP_BUSINESS_MESSAGING&product_route=whatsapp-business&business_id=4366489133585993&selected_tab=wa-dev-console)
    - Copy the token and paste in the 'Access Token' field of 'Send Message' node in n8n workflow
- Niyati workflow must be active in n8n editor
- Configure trigger nodes if needed (e.g., webhook URLs, Whatsapp integration)

5. Run the BFF server locally
```bash
cd /Users/ankur/projects/niyati/be/bff
npm install
npm run dev
```

6. Run Niyati UI locally
```bash
cd /Users/ankur/projects/niyati/ui
npm install
npm run dev
```

7. 
a) Expose the BFF server via ngrok if needed for external access.
b) Expose port for Niyati UI if needed using npx localtunnel
```bash
npx localtunnel --port 5173 --subdomain niyati-chat
```
What this does is expose Niyati UI at https://niyati-chat.loca.lt, so that you are not using localhost in URLs for testing.

7. Test end-to-end flow:
- Open Niyati UI in browser (http://localhost:5173)



====
ngrok token link: https://dashboard.ngrok.com/get-started/your-authtoken
ngrok token: 35C7AO4m8NoGkQgHMF8IMaSK3By_vyM2Abnqexgk3KvHDX9h
