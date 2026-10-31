// A declared metadata label, never a claim about unseen image content.
export function declaredNudity(text){
  const value=String(text??'').normalize('NFC');
  const full=/(?<![\p{L}\p{N}_-])(?:meztelen(?:ül)?|nude|naked)(?![\p{L}\p{N}_-])/iu;
  const partial=/(?<![\p{L}\p{N}_])(?:félmeztelen(?:ül)?|shirtless|semi[- ]nude)(?![\p{L}\p{N}_])/iu;
  const negated=/(?<![\p{L}\p{N}_])(?:nem|ne|nincs|not|no)\s+(?:(?:legyen|teljesen|látszódjon|fully|be)\s+){0,3}(?:meztelen(?:ül)?|nude|naked)(?![\p{L}\p{N}_])/iu;
  if(full.test(value)&&!negated.test(value))return 'full';
  return partial.test(value)?'partial':'not_declared';
}
