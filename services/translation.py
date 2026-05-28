"""Translation services for backend-owned API integrations."""

from __future__ import annotations

import json
import urllib.error
import urllib.request

from services.config import (
    DEEPSEEK_API_KEY,
    DEEPSEEK_API_URL,
    DEEPSEEK_TRANSLATION_MODEL,
    TRANSLATION_TIMEOUT_SECONDS,
)


TRANSLATION_LANGS = {
    "en_it": ("English", "Italian"),
    "it_en": ("Italian", "English"),
}


class TranslationError(ValueError):
    """Raised when translation cannot be completed."""


def translate_text(text: str, direction: str = "en_it") -> dict:
    if not DEEPSEEK_API_KEY:
        raise TranslationError("DeepSeek API key non configurata")

    cleaned = _clean_pdf_line_breaks(text)
    if not cleaned.strip():
        raise TranslationError("Testo da tradurre vuoto")

    source_lang, target_lang = TRANSLATION_LANGS.get(direction, TRANSLATION_LANGS["en_it"])
    payload = {
        "model": DEEPSEEK_TRANSLATION_MODEL,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a precise technical translator. Translate only the user text "
                    f"from {source_lang} to {target_lang}. Preserve line breaks, units, "
                    "symbols, formulas, and electronics terminology. Do not add notes, "
                    "explanations, markdown, quotation marks, or alternatives."
                ),
            },
            {"role": "user", "content": cleaned},
        ],
        "temperature": 0,
        "stream": False,
        "thinking": {"type": "disabled"},
    }

    request = urllib.request.Request(
        DEEPSEEK_API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=TRANSLATION_TIMEOUT_SECONDS) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise TranslationError(f"DeepSeek ha risposto con errore {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise TranslationError(f"DeepSeek non raggiungibile: {exc.reason}") from exc
    except TimeoutError as exc:
        raise TranslationError("Timeout durante la richiesta a DeepSeek") from exc

    choices = body.get("choices") or []
    if not choices:
        raise TranslationError("DeepSeek non ha restituito traduzioni")

    message = choices[0].get("message") or {}
    translated = _restore_common_symbols(cleaned, (message.get("content") or "").strip())
    if not translated:
        raise TranslationError("DeepSeek ha restituito una traduzione vuota")

    return {
        "translated_text": translated,
        "detected_source_language": source_lang,
        "provider": "deepseek",
        "model": body.get("model", DEEPSEEK_TRANSLATION_MODEL),
    }


def _clean_pdf_line_breaks(text: str) -> str:
    return text.replace("\r\n", "\n").replace("\r", "\n").replace("-\n", "").strip()


def _restore_common_symbols(source: str, translated: str) -> str:
    if "\u03a9" in source or "\u2126" in source or "0 ?" in translated:
        translated = translated.replace("0 ?", "0 \u03a9").replace("? (", "\u03a9 (")
        translated = translated.replace("0 \ufffd", "0 \u03a9").replace("\ufffd (", "\u03a9 (")
    return translated
