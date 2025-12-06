# Herní engine pro těžební sandbox

Tento dokument shrnuje klíčové schopnosti a doporučenou architekturu pro herní engine napsaný v Nette/PHP s frontendem v JavaScriptu/CSS.

## Správa materiálů a skupin
- **Katalog materiálů**: tabulka `materials` (id, key, název, popis, vzácnost, základní hodnota, typ_suroviny).
- **Skupiny/biomy**: tabulka `material_groups` s relací `material_group_material` pro určování, které materiály se nacházejí v daném biomu/minimapě.
- **API**: CRUD endpointy pro materiály a skupiny (auth + role), validace unikátních klíčů, možnost hromadných importů/exportů.
- **Frontend**: administrační UI s filtrováním, štítky vzácnosti a náhledem drop-rate pro každou skupinu.

## Recepty a kombinace
- **Recepty**: tabulka `recipes` (id, output_item_id, délka_výroby, požadovaná_profese, minimální_level, potřebné_nástroje).
- **Surovinové vstupy**: tabulka `recipe_ingredients` (recipe_id, material_id, množství) + `recipe_tools` pro specifické nástroje.
- **Výstupy**: tabulka `items` (id, key, typ, trvanlivost, síla, rychlost_těžby, váha, povolené_profese).
- **Logika**: crafting queue na serveru, která kontroluje dostupnost surovin v inventáři, rezervuje je a po čase je nahradí výsledkem.
- **Frontend**: crafting obrazovka s drag&drop vstupech a zobrazením doby výroby, tooltipy s požadavky.

## Hotové předměty a nástroje
- **Typy**: definovat sloty (nástroj, zbroj, spotřební předmět), statistiky (dmg, rychlost_těžby, bonus_k_dropu), trvanlivost a opravy.
- **Balancing**: konfigurovatelné multiplikátory podle profese a levelu, možnost enchanter/upgrade receptů.
- **Ekosystém**: aukční dům nebo obchodník, aby se ověřila ekonomika generování předmětů.

## Minimapové lokace a těžba
- **Lokace**: tabulka `maps` (id, key, typ_biomu, doporučený_level, maximální_současná_těžba, respawn_rate).
- **Uzly těžby**: tabulka `resource_nodes` (map_id, material_id, těžitelné_množství, respawn_čas, koeficient_vzácnosti).
- **Interakce**: API endpoint pro zahájení těžby validuje nástroj, profesi, cooldown a rezervuje node; dokončení těžby vypočítá drop podle nástroje, levelu a náhodného rollu.
- **Frontend**: minimapy s hover interakcí (zahájení těžby), vizuální timer, stav respawnu a indikátor rizika.

## Profese a postavy
- **Classy**: horník, dřevorubec, farmář, lovec; každá má vlastní strom dovedností a bonusy (rychlost_těžby, množství dropu, šance na rare drop).
- **Progrese**: tabulka `professions` + `character_professions` (xp, level, odemčené schopnosti).
- **Perk systém**: aktivní/permanentní buffy, sloty na specializace.
- **UI**: panel profese s přehledem bonusů a rychlým přepínáním aktivní profese.

## Inventář, ekonomika a provoz
- **Inventář**: tabulka `inventories` a `inventory_items` s hmotností nebo slotovým limitem, stackování dle typu itemu.
- **Ekonomika**: log transakcí, drop rate audit, anti-cheat (rate limiting, podpisy požadavků).
- **Realtime**: push přes websockets (Ratchet/Node) pro aktualizaci stavů těžby, dokončení craftu a obchodů.
- **Testování**: seedery s ukázkovými materiály, recepty a mapami; integrační testy na průchod těžba→crafting→předmět.

## Technologické poznámky
- **Backend (Nette/PHP)**: moduly `Materials`, `Recipes`, `Items`, `Maps`, `Professions`, `Inventory`. Každý modul by měl mít Service + Repository vrstvu, DTO pro API a autorizační policy.
- **Frontend (JS)**: modulární komponenty (např. Vue/React/Latte + vanilla) s event bus pro aktualizaci UI; využít Web Workers pro počítání timerů bez blokace UI.
- **SQL**: používat transakce při craftingu/těžbě, indexy na (map_id, respawn_čas), (recipe_id, material_id), (character_id, item_id).
- **Konfigurovatelnost**: YAML/NEON pro drop tabulky a balancing, aby designéři mohli ladit bez zásahu do kódu.

## Minimální MVP checklist
- CRUD pro materiály a skupiny
- Definice map a uzlů těžby + API pro zahájení/dokončení těžby
- Inventář hráče s nástroji ovlivňujícími rychlost těžby
- Crafting recepty generující nástroje typu dřevěná tyčka, sekera, krumpáč
- UI: minimapa s hover těžbou, crafting obrazovka, panel profese

