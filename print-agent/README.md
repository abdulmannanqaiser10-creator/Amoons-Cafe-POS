# Amoons Local Print Agent

Lightweight Windows background agent that lets the Soft-POS PWA send **RAW ESC/POS** jobs to network thermal printers on **TCP port 9100**.

- Listens only on `127.0.0.1:19100`
- Validates POS origins and a shared token
- Independent of the Vercel backend
- Starts automatically on Windows logon after `install.bat`

## Install

1. Install [Node.js 18+](https://nodejs.org/)
2. Run `install.bat` as Administrator
3. Confirm `http://127.0.0.1:19100/health` opens in a browser
4. In Soft-POS → Settings → Printer, enter the printer IP and Test Receipt

## Token

Default token: `amoons-pos-local`  
Override with environment variable `AMOONS_PRINT_TOKEN`.
