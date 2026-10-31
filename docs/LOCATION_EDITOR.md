# Helyszínszerkesztő

A laptop oldalsávjában a **Helyszínek** gomb, telefonon a **Helyszínek** fül nyitja meg. A lista tartalmazza a konkrét helyszíneket és a még önálló helyszíncímkéket is. A név, típus és az opcionális angol név alapján lehet keresni.

Szerkeszthető: magyar megjelenített név, típus, opcionális angol keresési név, leírás, valamint a nagyobb helyszín, amelyhez tartozik. Például Strand / strand / Beach, egy konkrét településhez kapcsolva. Az üres adatokat a program nem találja ki. A kapcsolat nem alkothat kört. Ez a későbbi térkép alapadatait tárolja; nem valósít meg térképet vagy világ-szimulációt.

A **Mentés** egy tranzakcióban frissíti a helyszín és a kapcsolt strukturált címke nevét. Azonosítók, képek, elsődleges és további helyszín-hozzárendelések, kánon, jegyzetek és rendezési állapotok megmaradnak. Mappát nem nevez át és fájlt nem mozgat. Az önálló címke szerkesztésekor csak szükség esetén készül hozzá helyszínrekord; a címke azonosítója megmarad. Az új helyszín létrehozása címke alapú, nem hoz létre OneDrive-mappát.

Másik eszköz módosításánál a mentés összehasonlítást kér, és nem írja felül automatikusan az újabb adatot. Az el nem mentett piszkozatot ugyanannak a böngészőnek a helyi tárhelye őrzi; törlése/ürülése elveszítheti a piszkozatot. Névütközés esetén nincs automatikus összevonás. A rendező a megadott angol keresési névvel is megtalálja a magyar nevű helyszínt.

A 016-os hozzáadó migráció külön location_profiles táblában tárolja az új mezőket, az export/restore tartalmazza azokat. Visszaállítás előtt készüljön export: a 016 down script csak az új leíró mezőket törli, a helyszínneveket, címkéket és média-hozzárendeléseket megőrzi. A hozzá tartozó szerkesztőkódot is vissza kell állítani. Régebbi adatbázis felülírása mindig külön jóváhagyott helyreállítási művelet, nem automatikus frissítési lépés.
