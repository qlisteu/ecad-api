# ECAD API

Backend API for ECAD Urbanism search service.

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Create environment file:
```bash
cp .env.example .env
```
Edit `.env` and add your OpenAI API key if you want AI analysis features.

3. Start development server:
```bash
npm run dev
```

4. Build for production:
```bash
npm run build
npm start
```

## Features

- Address search integration with Bucharest urbanism portal
- Zone information extraction
- PDF regulation document processing
- AI-powered regulation analysis (requires OpenAI API key)

## API Endpoints

- `POST /api/v0/urbanism/lookup` - Search address and return urbanism information
- `GET /api/v0/health` - Health check endpoint

## Architecture

- Node.js with Express
- TypeScript
- Integration with urbanism.pmb.ro
- OpenAI API for regulation analysis
