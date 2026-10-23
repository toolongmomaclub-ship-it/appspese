# Spese

Applicazione web per registrare e analizzare le spese personali. Il progetto
usa un frontend React, TypeScript e Vite, un'API FastAPI e MongoDB.

## Struttura

- `frontend/`: interfaccia web per spese, budget, categorie, importazioni,
  chilometri, carburante e analisi.
- `backend/`: API REST FastAPI e accesso ai dati MongoDB.
- `docker-compose.yml`: avvia MongoDB, API e frontend.

## Avvio con Docker

Dalla cartella principale del repository:

```sh
docker compose up --build -d
```

Apri <http://localhost:8080>. Il frontend inoltra le richieste `/api` al
backend. MongoDB e l'API sono inoltre esposti rispettivamente sulle porte
`27017` e `8001`.

I dati MongoDB sono conservati nel volume Docker `mongo-data` e restano
disponibili ai riavvii. Per arrestare i servizi senza rimuovere i dati:

```sh
docker compose down
```

Per seguire i log:

```sh
docker compose logs -f
```

## Sviluppo

Il frontend si avvia dalla cartella `frontend` con `npm ci` e `npm run dev`.
Per compilare e controllare i tipi TypeScript:

```sh
npm run build
```

Il backend usa le dipendenze elencate in `backend/requirements.txt` e si avvia
con Uvicorn. Le variabili principali sono `MONGO_URL`, `DB_NAME`,
`CORS_ORIGINS` e `APP_TZ`; in Compose sono configurate nel servizio `backend`.