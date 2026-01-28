# Coach - Negotiation Training

An AI-powered negotiation training platform that simulates email-based negotiations with real-time feedback and scoring.

## Features

- **Email-Based Negotiation Simulation**: Practice negotiations through realistic email exchanges
- **AI Counterparty**: Claude acts as your negotiation counterparty, responding realistically to your tactics
- **Real-Time Analysis**: Get scored on persuasiveness, clarity, professionalism, leverage, and strategy
- **Multiple Scenarios**: Practice different negotiation types (software licenses, vendor contracts, settlements)
- **Actionable Feedback**: Receive specific strengths, weaknesses, and suggestions for improvement

## Getting Started

### Prerequisites

- Node.js 18+
- An Anthropic API key

### Installation

1. Install dependencies:
   ```bash
   cd coach
   npm install
   ```

2. Set up your environment:
   ```bash
   cp .env.example .env
   ```

3. Add your Anthropic API key to `.env`:
   ```
   ANTHROPIC_API_KEY=your_api_key_here
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

## How It Works

1. **Select a Scenario**: Choose from pre-built negotiation scenarios
2. **Receive Opening Email**: The AI counterparty sends the first email
3. **Respond**: Craft your negotiation response
4. **Get Feedback**: See real-time analysis of your performance
5. **Iterate**: Continue the exchange to improve your score

## Scoring Categories

- **Persuasiveness**: How compelling are your arguments?
- **Clarity**: Is your communication clear and organized?
- **Professionalism**: Do you maintain appropriate tone and relationships?
- **Leverage**: Are you effectively using your bargaining position?
- **Strategy**: Are you employing good negotiation tactics?

## Tech Stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS
- Anthropic Claude API

## Future Roadmap

- Document markup/redlining support
- Custom scenario builder
- Progress tracking across sessions
- Multi-round analysis trends
- Export negotiation transcripts
