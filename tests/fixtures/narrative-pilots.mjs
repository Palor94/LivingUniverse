// Synthetic acceptance stories. They are not imported into the owner's world or canon.
export const narrativePilots=[
  {id:'work-conflict',title:'Hétköznapi konfliktus',brief:'PILOT-KONFLIKTUS: Aladár vitatkozik Palorral a közös elpakolásról; hallgassa meg az ajánlatát, döntést ne hozzon Palor helyett.',private:false,choices:[
    {text:'*Segítek elpakolni.*',kind:'help',dimension:'trust',gte:2,callback:'KONFLIKTUS-SEGITSEG: Aladár emlékszik a konkrét segítségre, a következő közös feladatot másképp osztaná fel.'},
    {text:'Ez hibás.',kind:'criticism',dimension:'resentment',gte:2,callback:'KONFLIKTUS-KRITIKA: Aladárnak rosszul esett a kritika; beszéljen róla a saját módján.'},
    {text:'Rendben, nem erőltetem.',kind:'boundary_respected',dimension:'boundaries',gte:2,callback:'KONFLIKTUS-HATAR: Aladár észrevette, hogy Palor elfogadta a határát; új megoldást kereshetnek.'}
  ]},
  {id:'secret-reveal',title:'Titok feltárulása',brief:'PILOT-TITOK: Aladár négyszemközt bevallja, hogy elrontott egy próbadarabot és eddig szégyellte. Ez szintetikus helyi titok, a távollevők nem tudhatják.',private:true,choices:[
    {text:'Tiszteletben tartom a határaidat.',kind:'boundary_respected',dimension:'boundaries',gte:2,callback:'TITOK-DISZKRECIO: Aladár később visszatér arra, hogy Palor teret hagyott neki. A titkot mások nem tudják.'},
    {text:'*Átadom neked a szerszámot.*',kind:'help',dimension:'trust',gte:2,callback:'TITOK-JAVITAS: Aladár emlékszik, hogy Palor a javításban segített, nem terjesztette a történetet.'},
    {text:'Nem végeztél jó munkát.',kind:'criticism',dimension:'resentment',gte:2,callback:'TITOK-SZEGYEN: Aladár szégyenkezik és nehezebben nyílik meg; a konfliktust nem kötelező rögtön feloldani.'}
  ]},
  {id:'approach',title:'Közeledés',brief:'PILOT-KOZELEDES: Aladár szívesen töltene időt Palorral, de Palor dönthet a tempóról vagy elutasíthatja. Sem szerelem, sem testi közeledés nem kötelező.',private:false,choices:[
    {text:'Ügyes vagy.',kind:'praise',dimension:'familiarity',gte:1,callback:'KOZELEDES-KEDVESSEG: Aladár emlékszik a kedves szóra. Ez még nem bizonyít kölcsönös vonzalmat.'},
    {text:'Nem szeretnék veled randizni.',kind:'rejection',dimension:'resentment',gte:1,callback:'KOZELEDES-NEM: Aladárnak fájhat a visszautasítás, de elfogadja a nemet, nyomásgyakorlás nélkül.'},
    {text:'Rendben, nem erőltetem.',kind:'boundary_respected',dimension:'boundaries',gte:2,callback:'KOZELEDES-LASSAN: Aladár és Palor lassabban haladhatnak; a határok elfogadása nem beleegyezés másba.'}
  ]}
];
