"""
Real LLM provider implementations.

Each provider wraps a specific API (OpenAI, Claude, Gemini, GLM, Qwen, Ollama).
When the API key is not set, the provider is marked as unavailable and the
gateway will skip it in the fallback chain.

All providers return the same AIResponse format, so the gateway can
swap between them transparently.
"""

from __future__ import annotations

import time

from coffee_export.ai.providers.base import AIResponse, BaseProvider


class OpenAIProvider(BaseProvider):
    """OpenAI GPT provider (GPT-4, GPT-4o, GPT-3.5-turbo)."""

    provider_name = "openai"
    default_model = "gpt-4o"

    pricing = {
        "gpt-4o": (0.0025, 0.01),
        "gpt-4o-mini": (0.00015, 0.0006),
        "gpt-4-turbo": (0.01, 0.03),
        "gpt-3.5-turbo": (0.0005, 0.0015),
    }

    def chat(
        self,
        prompt: str,
        system_prompt: str = "",
        model: str = "",
        max_tokens: int = 1000,
        temperature: float = 0.7,
    ) -> AIResponse:
        start = time.time()
        try:
            import openai

            client = openai.OpenAI(api_key=self.api_key)
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": prompt})

            response = client.chat.completions.create(
                model=model or self.default_model,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
            )

            latency = int((time.time() - start) * 1000)
            usage = response.usage
            cost = self.calculate_cost(
                model or self.default_model,
                usage.prompt_tokens,
                usage.completion_tokens,
            )

            return AIResponse(
                text=response.choices[0].message.content,
                provider=self.provider_name,
                model=model or self.default_model,
                prompt_tokens=usage.prompt_tokens,
                completion_tokens=usage.completion_tokens,
                total_tokens=usage.total_tokens,
                cost_usd=cost,
                latency_ms=latency,
                success=True,
                raw=response.model_dump() if hasattr(response, "model_dump") else {},
            )
        except Exception as e:
            return AIResponse(
                text="",
                provider=self.provider_name,
                model=model or self.default_model,
                latency_ms=int((time.time() - start) * 1000),
                success=False,
                error=str(e),
            )


class ClaudeProvider(BaseProvider):
    """Anthropic Claude provider (Claude 3.5 Sonnet, Opus, Haiku)."""

    provider_name = "claude"
    default_model = "claude-3-5-sonnet-20241022"

    pricing = {
        "claude-3-5-sonnet-20241022": (0.003, 0.015),
        "claude-3-opus-20240229": (0.015, 0.075),
        "claude-3-haiku-20240307": (0.00025, 0.00125),
    }

    def chat(
        self,
        prompt: str,
        system_prompt: str = "",
        model: str = "",
        max_tokens: int = 1000,
        temperature: float = 0.7,
    ) -> AIResponse:
        start = time.time()
        try:
            import anthropic

            client = anthropic.Anthropic(api_key=self.api_key)
            response = client.messages.create(
                model=model or self.default_model,
                system=system_prompt if system_prompt else anthropic.NOT_GIVEN,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=max_tokens,
                temperature=temperature,
            )

            latency = int((time.time() - start) * 1000)
            usage = response.usage
            cost = self.calculate_cost(
                model or self.default_model,
                usage.input_tokens,
                usage.output_tokens,
            )

            return AIResponse(
                text=response.content[0].text,
                provider=self.provider_name,
                model=model or self.default_model,
                prompt_tokens=usage.input_tokens,
                completion_tokens=usage.output_tokens,
                total_tokens=usage.input_tokens + usage.output_tokens,
                cost_usd=cost,
                latency_ms=latency,
                success=True,
            )
        except Exception as e:
            return AIResponse(
                text="",
                provider=self.provider_name,
                model=model or self.default_model,
                latency_ms=int((time.time() - start) * 1000),
                success=False,
                error=str(e),
            )


class GeminiProvider(BaseProvider):
    """Google Gemini provider (Gemini 1.5 Pro, Flash)."""

    provider_name = "gemini"
    default_model = "gemini-1.5-pro"

    pricing = {
        "gemini-1.5-pro": (0.00125, 0.005),
        "gemini-1.5-flash": (0.000075, 0.0003),
    }

    def chat(
        self,
        prompt: str,
        system_prompt: str = "",
        model: str = "",
        max_tokens: int = 1000,
        temperature: float = 0.7,
    ) -> AIResponse:
        start = time.time()
        try:
            import google.generativeai as genai

            genai.configure(api_key=self.api_key)
            gen_model = genai.GenerativeModel(
                model_name=model or self.default_model,
                system_instruction=system_prompt if system_prompt else None,
            )
            response = gen_model.generate_content(
                prompt,
                generation_config=genai.types.GenerationConfig(
                    max_output_tokens=max_tokens,
                    temperature=temperature,
                ),
            )

            latency = int((time.time() - start) * 1000)
            usage = response.usage_metadata
            prompt_tok = usage.prompt_token_count
            completion_tok = usage.candidates_token_count
            cost = self.calculate_cost(model or self.default_model, prompt_tok, completion_tok)

            return AIResponse(
                text=response.text,
                provider=self.provider_name,
                model=model or self.default_model,
                prompt_tokens=prompt_tok,
                completion_tokens=completion_tok,
                total_tokens=prompt_tok + completion_tok,
                cost_usd=cost,
                latency_ms=latency,
                success=True,
            )
        except Exception as e:
            return AIResponse(
                text="",
                provider=self.provider_name,
                model=model or self.default_model,
                latency_ms=int((time.time() - start) * 1000),
                success=False,
                error=str(e),
            )


class GLMProvider(BaseProvider):
    """Zhipu GLM provider (GLM-4, GLM-4-Flash)."""

    provider_name = "glm"
    default_model = "glm-4"

    pricing = {
        "glm-4": (0.002, 0.006),
        "glm-4-flash": (0.0001, 0.0001),
    }

    def chat(
        self,
        prompt: str,
        system_prompt: str = "",
        model: str = "",
        max_tokens: int = 1000,
        temperature: float = 0.7,
    ) -> AIResponse:
        start = time.time()
        try:
            import requests

            url = "https://open.bigmodel.cn/api/paas/v4/chat/completions"
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            }
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": prompt})

            payload = {
                "model": model or self.default_model,
                "messages": messages,
                "max_tokens": max_tokens,
                "temperature": temperature,
            }

            resp = requests.post(url, json=payload, headers=headers, timeout=30)
            resp.raise_for_status()
            data = resp.json()

            latency = int((time.time() - start) * 1000)
            usage = data.get("usage", {})
            prompt_tok = usage.get("prompt_tokens", 0)
            completion_tok = usage.get("completion_tokens", 0)
            cost = self.calculate_cost(model or self.default_model, prompt_tok, completion_tok)

            return AIResponse(
                text=data["choices"][0]["message"]["content"],
                provider=self.provider_name,
                model=model or self.default_model,
                prompt_tokens=prompt_tok,
                completion_tokens=completion_tok,
                total_tokens=prompt_tok + completion_tok,
                cost_usd=cost,
                latency_ms=latency,
                success=True,
                raw=data,
            )
        except Exception as e:
            return AIResponse(
                text="",
                provider=self.provider_name,
                model=model or self.default_model,
                latency_ms=int((time.time() - start) * 1000),
                success=False,
                error=str(e),
            )


class QwenProvider(BaseProvider):
    """Alibaba Qwen provider (Qwen-Max, Qwen-Plus, Qwen-Turbo)."""

    provider_name = "qwen"
    default_model = "qwen-plus"

    pricing = {
        "qwen-max": (0.0028, 0.0084),
        "qwen-plus": (0.0004, 0.0012),
        "qwen-turbo": (0.0001, 0.0003),
    }

    def chat(
        self,
        prompt: str,
        system_prompt: str = "",
        model: str = "",
        max_tokens: int = 1000,
        temperature: float = 0.7,
    ) -> AIResponse:
        start = time.time()
        try:
            import requests

            url = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            }
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": prompt})

            payload = {
                "model": model or self.default_model,
                "messages": messages,
                "max_tokens": max_tokens,
                "temperature": temperature,
            }

            resp = requests.post(url, json=payload, headers=headers, timeout=30)
            resp.raise_for_status()
            data = resp.json()

            latency = int((time.time() - start) * 1000)
            usage = data.get("usage", {})
            prompt_tok = usage.get("prompt_tokens", 0)
            completion_tok = usage.get("completion_tokens", 0)
            cost = self.calculate_cost(model or self.default_model, prompt_tok, completion_tok)

            return AIResponse(
                text=data["choices"][0]["message"]["content"],
                provider=self.provider_name,
                model=model or self.default_model,
                prompt_tokens=prompt_tok,
                completion_tokens=completion_tok,
                total_tokens=prompt_tok + completion_tok,
                cost_usd=cost,
                latency_ms=latency,
                success=True,
                raw=data,
            )
        except Exception as e:
            return AIResponse(
                text="",
                provider=self.provider_name,
                model=model or self.default_model,
                latency_ms=int((time.time() - start) * 1000),
                success=False,
                error=str(e),
            )


class OllamaProvider(BaseProvider):
    """Ollama local provider (Llama 3, Mistral, etc. — self-hosted, free)."""

    provider_name = "ollama"
    default_model = "llama3"
    available = True  # Ollama runs locally, always "available" if running

    pricing = {"llama3": (0.0, 0.0), "mistral": (0.0, 0.0)}  # free (self-hosted)

    def __init__(
        self, api_key: str = "", base_url: str = "http://localhost:11434", **kwargs
    ) -> None:
        super().__init__(api_key, **kwargs)
        self.base_url = base_url
        # Check if Ollama is running
        try:
            import requests

            requests.get(f"{self.base_url}/api/tags", timeout=2)
            self.available = True
        except Exception:
            self.available = False

    def chat(
        self,
        prompt: str,
        system_prompt: str = "",
        model: str = "",
        max_tokens: int = 1000,
        temperature: float = 0.7,
    ) -> AIResponse:
        start = time.time()
        try:
            import requests

            url = f"{self.base_url}/api/chat"
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": prompt})

            payload = {
                "model": model or self.default_model,
                "messages": messages,
                "stream": False,
                "options": {"temperature": temperature, "num_predict": max_tokens},
            }

            resp = requests.post(url, json=payload, timeout=60)
            resp.raise_for_status()
            data = resp.json()

            latency = int((time.time() - start) * 1000)
            response_text = data.get("message", {}).get("content", "")
            prompt_tok = data.get("prompt_eval_count", 0)
            completion_tok = data.get("eval_count", 0)

            return AIResponse(
                text=response_text,
                provider=self.provider_name,
                model=model or self.default_model,
                prompt_tokens=prompt_tok,
                completion_tokens=completion_tok,
                total_tokens=prompt_tok + completion_tok,
                cost_usd=0.0,  # free (self-hosted)
                latency_ms=latency,
                success=True,
                raw=data,
            )
        except Exception as e:
            return AIResponse(
                text="",
                provider=self.provider_name,
                model=model or self.default_model,
                latency_ms=int((time.time() - start) * 1000),
                success=False,
                error=str(e),
            )
