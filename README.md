# FOODIE — Online Food Ordering System

A responsive, static frontend for an online food-ordering experience. The application lives in [`client/`](client/) and is built with plain HTML, JavaScript, and Tailwind CSS v4. The current scope is deliberately frontend-only: no server, database, or API is included.

## Pages

| Path | Purpose |
| --- | --- |
| `client/index.html` | Landing page with featured menu items and service information. |
| `client/pages/login.html` | Sign-in form with client-side validation. |
| `client/pages/signup.html` | Account-creation form with client-side validation. |

## Run locally

```powershell
cd client
npm install
npm run build
npm run serve
```

Open <http://localhost:5173>. To rebuild the stylesheet as you work, use `npm run dev` in a second terminal.

## Project structure

```text
client/
├── assets/             # Local menu imagery
├── css/                # Generated stylesheet committed for static use
├── docs/               # Project reference and planning documents
├── guide/              # Original system-requirements specification
├── js/                 # Page behaviour and client-side form validation
├── pages/              # Additional HTML pages
├── src/                # Tailwind source stylesheet and design tokens
├── index.html          # Landing page
├── package.json        # Build scripts and development dependencies
└── package-lock.json
```

## Styling

From `client/`, edit `src/input.css` for design tokens and reusable Tailwind component layers. Run `npm run build` to regenerate `css/styles.css`. The generated CSS is committed so the pages also work when opened directly in a browser.

## Documentation

- [`client/guide/Online_Food_Ordering_System_SRS_Debopriya_Dey_Final.pdf`](client/guide/Online_Food_Ordering_System_SRS_Debopriya_Dey_Final.pdf) is the supplied requirements specification.
- [`client/docs/architecture.md`](client/docs/architecture.md) and [`client/docs/ai-implementation-guide.md`](client/docs/ai-implementation-guide.md) are planning/reference documents for potential future work; they do not add backend components to this frontend project.
