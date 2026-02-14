const qc = require('../apps/bff-platform/lib/nlpClassifier');

const messages = [
  'Hi Niyati, I am Ankur Vatsa born in New Delhi on 19 May 1979 at 7:31 am',
  'What does today hold for me?',
  "Yes, elaborate and suggest some practical actions to take advantage of today's themes",
  'What question would you like to ask? Do you want to know about your personality traits, career growth, relationships, or perhaps something else?',
  "How does this resonate with you? Would you like me to elaborate or perhaps suggest some practical actions to take advantage of today's themes?"
];

function isClarifyingResponse(text){
  if(!text||typeof text!=='string') return false;
  const t = text.toLowerCase();
  const clarifyingPatterns = [
    /could you tell me/i,
    /could you share/i,
    /please tell/i,
    /please share/i,
    /please provide/i,
    /what(?:'|)s your/i,
    /what is your/i,
    /which city/i,
    /which state/i,
    /time of birth/i,
    /date of birth/i,
    /place of birth/i,
    /were you born/i,
    /could you confirm/i
  ];
  if (clarifyingPatterns.some(p => p.test(t))) return true;
  if (t.includes('?') && /(birth|dob|date|time|place|born)/i.test(t)) return true;
  return false;
}

for (const m of messages) {
  console.log('---');
  console.log('Message:', m);
  console.log('getQueryType:', qc.getQueryType(m));
  console.log('getQueryCreditCost:', qc.getQueryCreditCost(m));
  console.log('isCasualConversation:', qc.isCasualConversation(m));
  console.log('isClarifyingResponse (UI heuristic):', isClarifyingResponse(m));
}
