export const anatomyGenerationGuide={
  version:1,
  applicability:'Kizárólag kifejezetten felnőtt (18+), önállóan kitalált karakter szerzői kidolgozásához. A csomag nem igazolja automatikusan egy személy fiktív eredetét vagy életkorát.',
  instructions:'A Megjelenés részben az anatomy és appearance_detail mezőkhöz az alábbi ellenőrzőlistát használd. Meglévő, kifejezetten rögzített adatoknál soronként jelöld: Meglévő: … . Önálló fiktív felnőtt karakter megalkotásakor a hiányzó részletekhez konkrét szerzői javaslatot adj, [Új Grok-javaslat] vagy a tényleges modell nevével jelölve. Számszerű javaslatnál egy értéket adj a mértékegységgel, opcionálisan szűk tartománnyal; a körfogatból az átmérő számítható: átmérő = kerület / π. Új javaslat kind=hypothesis és visibility=creator. A source igazmondóan különítse el a rögzített adatot, a látható jellemzőt és a szabad karakteralkotási javaslatot. Intim méretet, körülmetéltséget vagy nem látható anatómiai jegyet ne következtess testalkatból, életkorból, származásból, hajszínből vagy felöltözött referenciaképből. Valós vagy bizonytalan eredetű személyhez ne találj ki intim tulajdonságokat; ilyenkor ezek maradjanak ismeretlenek. A testszőrzet színe és mintázata nem következik szükségszerűen a hajból vagy szakállból. Az értékek belső összhangját ellenőrizd, de ne állíts orvosi szükségszerűséget. Tárgyszerű anatómiai leírást adj. Meglévő kánont nem írsz felül; minden új részlet szerzői elbírálásra vár.',
  fields:{
    anatomy:{format:'A–C szakasz, pontonként külön sor; a forrást és az új javaslat jelölését minden adat mellett tüntesd fel.',sections:[
      {id:'A',title:'Pénisz',items:[
        'Hossz nyugalmi állapotban (cm).',
        'Hossz merevedésben, a szeméremcsonttól a makk csúcsáig (cm).',
        'Kerület merevedésben, a törzs közepén (cm); ebből számított átmérő (cm).',
        'Forma: egyenletes, tő felé vastagodó, közepén vastagabb vagy csúcs felé vastagodó.',
        'Görbület iránya és mértéke (fok), vagy egyenes.',
        'Merevedési szög álló helyzetben: hashoz közeli, vízszintes vagy lefelé; az alkalmazott óraállás viszonyítását add meg.',
        'Makk formája és mérete a törzshöz képest.',
        'Fityma / körülmetéltség; takarás nyugalomban és visszahúzódás merevedésben.',
        'Bőrszín a test többi bőréhez képest és látható erezettség.',
        'Méretváltozás nyugalomból merevedésbe (grower / shower jelleg); legyen összhangban a megadott méretekkel.'
      ]},
      {id:'B',title:'Herék és herezacskó',items:[
        'Méret: kicsi, átlagos vagy nagy; javasolt hosszúság (cm).',
        'Magasan, közepesen vagy mélyen elhelyezkedő; meleg és hideg hatására történő változás.',
        'Szimmetria: melyik oldal helyezkedik el lejjebb, vagy közel azonos.',
        'Herezacskó bőrének jellemzői, színe és szőrzete.'
      ]},
      {id:'C',title:'Fanszőrzet',items:[
        'Mennyiség és sűrűség: ritka, közepes vagy dús.',
        'Ápoltság: természetes, nyírt (mm), formázott vagy borotvált; ápolási gyakoriság.',
        'Szín és textúra: egyenes, hullámos vagy göndör.',
        'Kiterjedés: szeméremtájék, köldök felé, combtő és herezacskó.'
      ]}
    ]},
    appearance_detail:{format:'A meglévő részletes megjelenést őrizd meg; külön D szakaszban egészítsd ki. Minden területnél mennyiség (nincs / gyér / közepes / dús), szín és ápoltság (természetes / nyírt / borotvált / gyantázott), külön forrásjelöléssel.',sections:[
      {id:'D',title:'Testszőrzet',items:[
        'Mellkas; minta: középen, mellbimbók körül vagy összefüggő.',
        'Has és köldök alatti szőrcsík.',
        'Hónalj.',
        'Kar és alkar.',
        'Láb és comb.',
        'Hát és váll.',
        'Fenék és fenékrés környéke.',
        'Arcszőrzet: borotvált, borosta (mm) vagy szakáll típusa.'
      ]}
    ]}
  }
};

export function appearanceFieldGuidance(){return Object.fromEntries(Object.entries(anatomyGenerationGuide.fields).map(([id,field])=>[id,[anatomyGenerationGuide.applicability,anatomyGenerationGuide.instructions,field.format,...field.sections.flatMap(section=>[section.id+') '+section.title,...section.items.map((item,i)=>(i+1)+'. '+item)])].join('\n\n')]));}
