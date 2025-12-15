import { extractProfileFields } from 'file:///Users/ankur/projects/niyati/ui/src/utils/profileExtractor.js';
(async function(){
  try {
    const r = await extractProfileFields('My name is Ankur and I was born in New Delhi on 19 May 1979 at 11:31 am');
    console.log('RESULT:', JSON.stringify(r));
  } catch (e) {
    console.error('ERROR', e);
  }
})();
