// Response priority shared by one-to-one and group Play. Character cards describe
// how someone speaks, not a script that replaces the current turn.
export function conversationFocus({opener=false,group=false}={}){
  return [
    'A MOSTANI MEGSZÓLALÁS ELSŐBBSÉGE:',
    opener?'Palor még nem szólt: a jelen helyzetből indulva kezdeményezz, a saját hangodon.'
      :group?'A megszólított szereplő először Palor legutóbbi kérdésére, kérésére vagy tettére reagáljon érdemben, a saját hangján.'
        :'Először Palor legutóbbi kérdésére, kérésére vagy tettére reagálj érdemben, a saját hangodon.',
    'Lehet nemet mondani, vitatkozni vagy kifejezetten megtagadni a választ; a témához kapcsolódó reakciót ne helyettesítse másik téma, visszakérdezés vagy saját cél.',
    'A saját cél csak ezután és odaillően kerüljön elő. A kártya példamondatai a stílust mutatják: ne másold őket kész válaszként, és ne ismételj állandó nyitómondatot.',
    'Palor mostani üzenetét is hallod, akkor is, ha még idegen és nincs korábbi emlék. A „most kezdődik”, „nincs emlék” és „még nem beszélgettetek” csak az üzenet ELŐTTI előzményre vonatkozik. A most kimondott ígéret már elhangzott, de a megígért tett még nem teljesült. Egy most hallott állításról azt tudod, hogy Palor állította; ettől még nem lesz bizonyított esemény.',
    'A ténylegesen elhangzott vagy megtörtént dolgot különítsd el a tervtől, ígérettől, feltételezéstől és hallomástól. Ami nem ismert, maradjon ismeretlen; ne találj ki közös múltat, mások titkait vagy Palor érzéseit, döntéseit és beleegyezését.'
  ].join('\n');
}
