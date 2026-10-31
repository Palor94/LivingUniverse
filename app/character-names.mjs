// Human suggestions are Hungarian male given names, without family names.
const human='Ábel Ádám Adrián Ákos Albert Alex Alexander Alfréd Álmos Andor András Antal Ármin Áron Attila Balázs Bálint Barna Barnabás Béla Bence Benedek Benett Benjámin Bertalan Boldizsár Botond Bulcsú Csaba Csanád Csongor Dániel Dávid Dénes Dezső Domán Domonkos Donát Dorián Elemér Elek Emil Endre Erik Ernő Fábián Ferenc Flórián Gábor Gellért Gergely Gergő Géza György Gyula Győző Henrik Hugó Hunor Ignác Imre István Iván Izsák Jakab János Jenő József Jusztin Kálmán Károly Kelemen Kende Kevin Kolos Konrád Kornél Kristóf Lajos László Lehel Leó Leonárd Levente Lóránd Lőrinc Lukács Marcell Márk Márton Máté Mátyás Mihály Miklós Milán Nándor Nimród Noel Norbert Olivér Oszkár Ottó Örs Pál Patrik Péter Rafael Rajmund Richárd Róbert Roland Sámuel Sándor Sebestyén Simon Soma Szabolcs Szilárd Tamás Tibor Tivadar Vince Viktor Vilmos Zalán Zétény Zoltán Zsolt Zsombor'.split(' ');

// Each fantasy category has its own sound patterns and the creator's examples.
// Pools are finite and never fall back to human names or numeric suffixes.
const patterns={
  orc:{examples:'Grommash Throm-Ka Azog Krag Durgash Zog',roots:'Gr Kr Br Dr Throm Grom Durg Zog Karg Murg Vorg Ugr Rakh Thrag Ghor Draz Krug Bogr',ends:'ag og ug ash ak gash mok groth grom murg -Ka -Gor'},
  goblin:{examples:'Zzig Grix Snikt Skazz Vob Zzap',roots:'Zz Gr Sn Sk V Z Kr Snik Skr Vizz Gl Nix Rik Zik Spl Kizz',ends:'ig ix ik azz ob ap itz ip ikt izz'},
  troll:{examples:'Brog Grok Thrum Zulg Gorgo',roots:'Br Gr Thr Zul Gor Bor Morg Grum Drog Brug Ulg Throg Gurg Drom Vrog',ends:'og ok um ulg go ung om ug rum org'},
  minotaur:{examples:'Asterius Taurus Morgoth',roots:'Aster Taur Morn Karg Bar Tor Morth Gaur Thaur Argan Drom Kor Bront Vorn Orthon',ends:'ius os on oth ar ax eus or ath ion'},
  centaur:{examples:'Chiron Nessus Pholos Kratos Strom',roots:'Chir Ness Phol Krat Str Aeth Ther Arion Kall Zeph Thes Or Phen Tal Ery',ends:'on os us ion or an eos aron athos en'},
  satyr_faun:{examples:'Pan Faunus Satyrion Crotus Silenus',roots:'Faun Satyr Crot Silen Pan Sylv Thyrs Lyk Mel Daph Nym Aris Ery Phaun',ends:'us ion os an on ius as en or eus'},
  werewolf:{examples:'Fenrir Boris Varg Garou Lycaon',roots:'Fen Var Gar Lyk Bor Ulv Hrod Skoll Hark Rauk Vorn Wulf Bran Grist',ends:'ir arg en ok an orn ulf ar rak on'},
  lizardfolk_dragonborn:{examples:'Sssar Drako Kressh Shisss Vrakh',roots:'Sss Drak Kress Shiss Vrak Ssath Xiss Zhar Thass Ssk Rhass Vess Khiss Zzath',ends:'ar o sh ak hiss ith ess ssa ash ork'},
  dwarf:{examples:'Thorin Balin Durin Gromi Thrain',roots:'Thor Bal Dur Grom Thra Bronn Dwal Bor Grim Khar Mor Thror Drom Gund',ends:'in i ain ar ik or im un ak rin'},
  ogre:{examples:'Goliath Grog Ymir Blunder Oglok',roots:'Grol Grog Ym Blund Ogl Bol Grum Brug Mog Ogg Bugg Dorg Lug Thog',ends:'ok og um ar ug or ak om er uk'},
  bearfolk_bullfolk:{examples:'Ursus Biorn Toruk Karr',roots:'Urs Biorn Tor Karr Bjorn Urr Bor Brum Hurn Gorr Thaur Rauk Dorn Varr',ends:'us uk ar orn um ok an ur ak or'}
};
export const raceNameCandidates=Object.freeze(Object.fromEntries([
  ['human',Object.freeze(human)],
  ...Object.entries(patterns).map(([race,{examples,roots,ends}])=>[
    race,Object.freeze([...new Set([...examples.split(' '),...roots.split(' ').flatMap(root=>ends.split(' ').map(end=>(end.startsWith('-')&&!/[aeiouy]/i.test(root)?root+'ak':root)+end))])])
  ])
]));
