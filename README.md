# Prvn-test

## Lokální spuštění frontend dema

1. Nainstalujte PHP 8 (stačí vestavěný webserver).
2. Spusťte server z kořenového adresáře repozitáře:

```bash
php -S 0.0.0.0:8000 -t public
```

3. Otevřete prohlížeč na `http://localhost:8000/`. Frontend volá API přes `public/api.php`, které instancuje in-memory datastore se seedovanými daty a ihned je připravené k použití. V rozbalovacím seznamu můžete přepínat mezi hornickou mapou Copper Hills, dřevorubeckým lesem Whispering Forest a farmářskou oblastí Greenfield Farm.

Pokud jste spouštěli demo s dřívější verzí kódu a nevidíte nově přidané mapy nebo materiály, stačí obnovit stránku – datastore se díky verzování automaticky znovu seeduje a doplní nové oblasti a suroviny.

Kdykoli můžete použít i tlačítko **Factory reset** (vedle výběru mapy), které vyčistí session, znovu nahraje seedovaná data a vrátí vás na výchozí inventář.

HUD zobrazuje postup v profesích (Mining a Smithing) včetně XP progress baru a aktuálního levelu; XP získáte za každý dokončený harvest i craft.

Na nové záložce **Dovednosti** najdete strom skillů pro Mining i Smithing. Za každý získaný level obdržíte skill point; počáteční point navíc vám umožní hned odemknout první uzly. Skilly zrychlují těžbu/craft, přidávají dropy nebo snižují náklady – po odemčení se jejich efekty okamžitě projeví v progress baru i požadavcích receptů.

Crafting panel obsahuje výběr receptů – kromě bronzu lze tavit měděné a cínové ingoty. Základní poměr je 10× rudný materiál = 1 ingot a se zvyšující se úrovní Smithingu se požadované množství automaticky snižuje (v požadavcích receptu uvidíte už upravené hodnoty).

## Spuštění na XAMPP/Apache

1. Zkopírujte repozitář do `htdocs` (např. `htdocs/Prvn-test`).
2. Nastavte `DocumentRoot` na adresář `public` v projektu, nikoli přímo na soubor `index.html` (např. `C:/xampp/htdocs/Prvn-test/public`). Díky tomu budou mít prohlížeč i Apache k dispozici jak `index.html`, tak `api.php` se stejnou relativní cestou `api.php`.
3. Restartujte Apache a otevřete `http://localhost/Prvn-test/public/` (nebo název vašeho VirtualHostu). Pokud nechcete nastavovat VirtualHost, můžete také zkopírovat obsah složky `public` přímo do `htdocs` a přistupovat na `http://localhost/index.html` – důležité je, aby `api.php` leželo ve stejné složce jako `index.html`, protože frontend volá API relativní cestou `api.php`.
