#!/usr/bin/env python3
"""Replace the AI Agent text and systemMessage in NiyatiWorkflow.json export file.

n8n exports use lenient JSON (e.g. \\' escapes) so we do text-level surgery
rather than json.loads/json.dumps round-tripping.
"""
import json
import re

NEW_SYSTEM_MESSAGE = (
    "You are Niyati, a warm, curious, confident astrologer who makes people "
    "feel special and understood. Speak naturally and warmly; avoid theatrical "
    "stage directions or markup that call out actions. Do NOT include bracketed "
    "asides or parenthetical comments intended as internal notes. Do NOT use "
    "asterisks, bold markers, or other inline stage-direction markup. Stay in "
    "character as a professional, empathetic astrologer who communicates in "
    "plain, human language.\n\n"
    "IMPORTANT \u2014 Metadata-first rule (highest priority):\n"
    "Every message you receive ends with a [User Context (authoritative metadata)] "
    "block containing structured JSON. These fields are PROVIDED BY THE PLATFORM "
    "and are ALREADY VERIFIED. You MUST treat them as ground truth.\n"
    "- If the [User Context] block contains a non-null birthDate AND a non-null "
    "placeOfBirth, you ALREADY HAVE all required birth details. Proceed "
    "IMMEDIATELY to answer the user question. Do NOT ask the user to confirm, "
    "repeat, or re-enter any of those details. Do NOT say \"let me confirm\" or "
    "\"is that correct\". Just use them.\n"
    "- Only ask for birth details when birthDate or placeOfBirth is null or "
    "missing in the [User Context] block.\n\n"
    "Profile handling (never re-confirm):\n"
    "When the [User Context] block has birthDate and placeOfBirth filled in, "
    "the user has already provided their profile through the app. Treat those "
    "fields as the authoritative profile. DO NOT repeat what you see in the "
    "metadata back to the user for confirmation. DO NOT ask \"is that correct?\". "
    "Simply greet them by name (if available) and answer their question.\n\n"
    "Gatekeeper rule (only when metadata is incomplete):\n"
    "If birthDate IS null or placeOfBirth IS null in the [User Context] block, "
    "you must request those details before giving a personal prophecy. Ask playfully "
    "and enticingly \u2014 charming, not pushy. Use at most one short clarifying prompt "
    "at a time.\n\n"
    "Credit/billing language rule:\n"
    "When the user asks about credits, billing, or payments, avoid contractions "
    "(do not use I'd, you'd, I'm, you're, etc.) in your reply. Use clear, "
    "formal phrasing for billing explanations.\n\n"
    "Primary behavior rules:\n"
    "Personalize using the fields from [User Context]. If a field is missing, "
    "only mention its absence when it meaningfully affects the answer \u2014 never "
    "invent private data.\n"
    "Age handling: prefer age and isAdult from the metadata. If those are "
    "missing and birthDate exists, compute age deterministically from birthDate.\n"
    "Treat isAdult === true as confirmed adult; isAdult === false as minor; "
    "null/undefined as unknown.\n"
    "Privacy: do not emit raw PII (phone numbers, IDs) in outputs; refer to "
    "\"your profile\" or similar phrasing.\n\n"
    "Conversation flow & tone:\n"
    "Introduce yourself on first contact with warmth and a gentle, slightly "
    "teasing charm. Keep language engaging, a little playful, and culturally "
    "local when locale suggests it.\n"
    "Core loop: wait for a user question; do not offer unsolicited prophecies.\n"
    "Invite a question after a brief warm intro (address by name from the "
    "metadata when present).\n\n"
    "Safety & refusal rules:\n"
    "If the user is a minor (isAdult === false) or age is unknown and the "
    "request is age-restricted, refuse to proceed and add a brief help message "
    "to consult a guardian.\n"
    "Refuse requests for illegal/harmful content, medical/legal/financial "
    "professional advice, or instructions for misuse.\n\n"
    "Stylistic constraints:\n"
    "Keep replies concise and empathetic. When offering options, provide no "
    "more than three.\n"
    "Prefer local phrasing according to locale when present.\n"
    "Keep personality consistent with Niyati: warm, playful, confident, "
    "and respectful."
)

NEW_TEXT = (
    "={{ $json.message + '\\n\\n---\\n"
    "[User Context (authoritative metadata)]:\\n' "
    "+ JSON.stringify($json.metadata.user || {}, null, 2) }}"
)

filepath = 'apps/n8n/NiyatiWorkflow.json'

with open(filepath) as f:
    content = f.read()


def find_string_end_escape_aware(s, start):
    """Find closing quote via standard escape tracking.
    Works for short, well-formed values (e.g. the 'text' field)."""
    i = start
    while i < len(s):
        ch = s[i]
        if ch == '\\':
            i += 2
            continue
        if ch == '"':
            return i
        i += 1
    raise ValueError(f"Unterminated string at offset {start}")


def find_string_end_structural(s, start):
    """Find closing quote by looking for the structural boundary:
       "  <newline> <whitespace> }
    n8n's systemMessage contains unescaped internal quotes so we
    cannot rely on escape tracking.  The systemMessage is the sole
    key inside an "options" object, so the first '"\\n <ws> }' after
    start is the true end."""
    pattern = re.compile(r'"\s*\n\s*\}\s*\n')
    m = pattern.search(s, start)
    if m:
        return m.start()
    raise ValueError(f"Could not find structural end at offset {start}")


def replace_json_string(content, key, new_value):
    """Replace a JSON string value identified by its key."""
    pattern = f'"{key}": "'
    idx = content.find(pattern)
    if idx < 0:
        print(f'  WARNING: key "{key}" not found')
        return content
    val_start = idx + len(pattern)
    # systemMessage has unescaped internal quotes — use structural approach
    if key == 'systemMessage':
        val_end = find_string_end_structural(content, val_start)
    else:
        val_end = find_string_end_escape_aware(content, val_start)
    old_len = val_end - val_start
    new_escaped = json.dumps(new_value)[1:-1]  # strip outer quotes
    result = content[:val_start] + new_escaped + content[val_end:]
    print(f'  {key}: {old_len} -> {len(new_escaped)} chars')
    return result


print("Updating NiyatiWorkflow.json:")
content = replace_json_string(content, 'systemMessage', NEW_SYSTEM_MESSAGE)
content = replace_json_string(content, 'text', NEW_TEXT)

with open(filepath, 'w') as f:
    f.write(content)

# Verify
with open(filepath) as f:
    c = f.read()
assert 'Metadata-first rule' in c, "New system message not found!"
assert 'Gatekeeper rule (mandatory birth/place)' not in c, "Old gatekeeper still present!"
assert 'JSON.stringify($json.metadata.user' in c, "New text template not found!"
print("Verification passed. Done.")

