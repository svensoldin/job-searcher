# 🤖 FREE AI Setup with Hugging Face

Your job hunter now uses **Hugging Face** instead of OpenAI - completely FREE with generous limits!

## Quick Setup (2 minutes)

### 1. Get Your FREE Hugging Face API Key

1. Go to [huggingface.co](https://huggingface.co)
2. Sign up for a free account
3. Go to [Settings > Access Tokens](https://huggingface.co/settings/tokens)
4. Create a new token with "Read" access
5. Copy your token

### 2. Add to Environment

```bash
# Copy .env.example to .env
cp .env.example .env

# Edit .env and add your token:
HUGGING_FACE_API_KEY=hf_your_token_here
```

### 3. Test It Works

```bash
yarn weekly
```

## What Changed?

✅ **FREE**: No costs, no billing issues  
✅ **Generous Limits**: 1000 requests/month (vs OpenAI's $0)  
✅ **Good Quality**: Uses Mistral-7B-Instruct model  
✅ **Heroku Ready**: Works perfectly on cloud platforms

## Rate Limits

- **10 requests/minute** (6 second delays)
- **33 requests/day** (~1000/month)
- Smart rate limiting built-in

## Model Used

## Model Used

- **mistralai/Mistral-7B-Instruct-v0.2**: Free, high-quality, excellent at job analysis
- **Uses Chat Completion**: Perfect for conversational analysis tasks

Perfect for your Heroku deployment! 🚀
