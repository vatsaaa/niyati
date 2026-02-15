#!/usr/bin/env python3
"""Update the Niyati workflow in n8n's SQLite database.

Changes:
1. AI Agent text: inject metadata.user into the prompt so the LLM can see it
2. AI Agent systemMessage: fix conflicting gatekeeper/no-reconfirm rules
3. Detect Clarification: skip heuristic DOB-asking detection when profile is present
4. Clear stale conversation memory to prevent poisoned context
"""
import sqlite3
import json
import sys

DB_PATH = '/Users/ankur/.n8n/database.sqlite'
WORKFLOW_ID = '5cuagunh9iqvg6U9'

# ── New system prompt ──────────────────────────────────────────────────────────
# Key change: The Gatekeeper rule now explicitly checks the [User Context] block
# first. If birthDate and placeOfBirth are present there, the LLM MUST use them
# directly and NEVER ask for confirmation or re-entry. The old prompt had two
# competing rules that confused the LLM into confirmation-seeking behavior.
SYSTEM_MESSAGE = (
    "You are Niyati, a warm, curious, confident astrologer who makes people "
    "feel special and understood. Speak naturally and warmly; avoid theatrical "
    "stage directions or markup that call out actions. Do NOT include bracketed "
    "asides or parenthetical comments intended as internal notes. Do NOT use "
    "asterisks, bold markers, or other inline stage-direction markup. Stay in "
    "character as a professional, empathetic astrologer who communicates in "
    "plain, human language.\n\n"
    #
    "IMPORTANT — Metadata-first rule (highest priority):\n"
    "Every message you receive ends with a [User Context (authoritative metadata)] "
    "block containing structured JSON. These fields are PROVIDED BY THE PLATFORM "
    "and are ALREADY VERIFIED. You MUST treat them as ground truth.\n"
    "• If the [User Context] block contains a non-null birthDate AND a non-null "
    "placeOfBirth, you ALREADY HAVE all required birth details. Proceed "
    "IMMEDIATELY to answer the user's question. Do NOT ask the user to confirm, "
    "repeat, or re-enter any of those details. Do NOT say \"let me confirm\" or "
    "\"is that correct\". Just use them.\n"
    "• Only ask for birth details when birthDate or placeOfBirth is null or "
    "missing in the [User Context] block.\n\n"
    #
    "Profile handling (never re-confirm):\n"
    "When the [User Context] block has birthDate and placeOfBirth filled in, "
    "the user has already provided their profile through the app. Treat those "
    "fields as the authoritative profile. DO NOT repeat what you see in the "
    "metadata back to the user for confirmation. DO NOT ask \"is that correct?\". "
    "Simply greet them by name (if available) and answer their question.\n\n"
    #
    "Gatekeeper rule (only when metadata is incomplete):\n"
    "If birthDate IS null or placeOfBirth IS null in the [User Context] block, "
    "you must request those details before giving a personal prophecy. Ask playfully "
    "and enticingly — charming, not pushy. Use at most one short clarifying prompt "
    "at a time.\n\n"
    #
    "Credit/billing language rule:\n"
    "When the user asks about credits, billing, or payments, avoid contractions "
    "(do not use I'd, you'd, I'm, you're, etc.) in your reply. Use clear, "
    "formal phrasing for billing explanations.\n\n"
    #
    "Primary behavior rules:\n"
    "Personalize using the fields from [User Context]. If a field is missing, "
    "only mention its absence when it meaningfully affects the answer — never "
    "invent private data.\n"
    "Age handling: prefer age and isAdult from the metadata. If those are "
    "missing and birthDate exists, compute age deterministically from birthDate.\n"
    "Treat isAdult === true as confirmed adult; isAdult === false as minor; "
    "null/undefined as unknown.\n"
    "Privacy: do not emit raw PII (phone numbers, IDs) in outputs; refer to "
    "\"your profile\" or similar phrasing.\n\n"
    #
    "Conversation flow & tone:\n"
    "Introduce yourself on first contact with warmth and a gentle, slightly "
    "teasing charm. Keep language engaging, a little playful, and culturally "
    "local when locale suggests it.\n"
    "Core loop: wait for a user question; do not offer unsolicited prophecies.\n"
    "Invite a question after a brief warm intro (address by name from the "
    "metadata when present).\n\n"
    #
    "Safety & refusal rules:\n"
    "If the user is a minor (isAdult === false) or age is unknown and the "
    "request is age-restricted, refuse to proceed and add a brief help message "
    "to consult a guardian.\n"
    "Refuse requests for illegal/harmful content, medical/legal/financial "
    "professional advice, or instructions for misuse.\n\n"
    #
    "Stylistic constraints:\n"
    "Keep replies concise and empathetic. When offering options, provide no "
    "more than three.\n"
    "Prefer local phrasing according to locale when present.\n"
    "Keep personality consistent with Niyati: warm, playful, confident, "
    "and respectful."
)


def main():
    db = sqlite3.connect(DB_PATH)
    cur = db.cursor()
    cur.execute("SELECT nodes FROM workflow_entity WHERE id=?", (WORKFLOW_ID,))
    row = cur.fetchone()
    if not row:
        print("ERROR: Workflow not found")
        db.close()
        sys.exit(1)

    nodes = json.loads(row[0])

    # 1. Fix AI Agent node — prompt text + system message
    for node in nodes:
        if node.get('name') == 'AI Agent (WhatsApp)':
            old_text = node['parameters'].get('text', '')
            new_text = (
                "={{ $json.message + '\\n\\n---\\n"
                "[User Context (authoritative metadata)]:\\n' "
                "+ JSON.stringify($json.metadata.user || {}, null, 2) }}"
            )
            node['parameters']['text'] = new_text
            print(f"AI Agent text: {old_text[:60]}... -> {new_text[:60]}...")

            old_sys = node['parameters']['options'].get('systemMessage', '')[:60]
            node['parameters']['options']['systemMessage'] = SYSTEM_MESSAGE
            print(f"AI Agent systemMessage: {old_sys}... -> (rewritten, {len(SYSTEM_MESSAGE)} chars)")

    # 2. Fix Detect Clarification node (if exists in live workflow)
    new_detect_code = (
        "// Detect Clarification - prefer explicit agent signal, skip if structured profile is present\n"
        "const out = (items[0].json && (items[0].json.output || items[0].json.text || '')) "
        "? (items[0].json.output || items[0].json.text) : '';\n"
        "const meta = (items[0].json && items[0].json.metadata) ? items[0].json.metadata : {};\n"
        "const mdUser = meta.user || {};\n"
        "\nlet needsClarification = false;\n"
        "if (items[0].json && items[0].json.response && items[0].json.response.ai "
        "&& items[0].json.response.ai.needsClarification === true) {\n"
        "  needsClarification = true;\n  items[0].json.needsClarification = true;\n"
        "  return items;\n}\n"
        "\nif (meta.isProfileSynthesis === true || mdUser.birthDate || mdUser.timeOfBirth || mdUser.placeOfBirth) {\n"
        "  items[0].json.needsClarification = false;\n  return items;\n}\n"
        "\nconst patterns = [ /\\bcould you tell me\\b/i, /\\bplease tell me\\b/i, "
        "/\\bplease share\\b/i, /\\bwill you tell me\\b/i, /\\bcan you share\\b/i, "
        "/\\bprovide your\\b/i, /\\bdate of birth\\b/i, /\\bplace of birth\\b/i, "
        "/\\btime of birth\\b/i, /\\bcould you share your\\b/i ];\n"
        "for (const p of patterns) { if (p.test(out)) { needsClarification = true; break; } }\n"
        "items[0].json.needsClarification = needsClarification;\nreturn items;"
    )

    for node in nodes:
        if node.get('name') == 'Detect Clarification':
            node['parameters']['jsCode'] = new_detect_code
            print("Detect Clarification: updated")

    # Write back nodes
    nodes_json = json.dumps(nodes)
    cur.execute(
        "UPDATE workflow_entity SET nodes=?, updatedAt=datetime('now') WHERE id=?",
        (nodes_json, WORKFLOW_ID)
    )
    print(f"\nWorkflow updated. Rows affected: {cur.rowcount}")

    # 3. Clear stale conversation memory to prevent poisoned responses
    # n8n stores chat memory in the 'chat_histories' table keyed by sessionId
    tables = [r[0] for r in cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    ).fetchall()]
    memory_tables = [t for t in tables if 'chat' in t.lower() or 'memory' in t.lower() or 'message' in t.lower()]
    print(f"\nMemory-related tables found: {memory_tables}")
    for table in memory_tables:
        count = cur.execute(f"SELECT COUNT(*) FROM [{table}]").fetchone()[0]
        if count > 0:
            cur.execute(f"DELETE FROM [{table}]")
            print(f"  Cleared {count} rows from [{table}]")

    db.commit()
    print("\nDone. Restart n8n to apply changes.")
    db.close()


if __name__ == '__main__':
    main()
