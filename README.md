# Prvn-test

## Lokální spuštění frontend dema

1. Nainstalujte PHP 8 (stačí vestavěný webserver).
2. Spusťte server z kořenového adresáře repozitáře:

```bash
php -S 0.0.0.0:8000 -t public
```

3. Otevřete prohlížeč na `http://localhost:8000/`. Frontend volá API přes `public/api.php`, které instancuje in-memory datastore se seedovanými daty a ihned je připravené k použití.
