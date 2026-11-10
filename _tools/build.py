#!/usr/bin/env python3
"""Genera la web estática de 0dopamine.com a partir de las fuentes bilingües.

    python3 _tools/build.py          # desde la raíz del repo

Las páginas se escriben en `_src/` con los dos idiomas mezclados (atributo
`data-lang="es"` / `data-lang="en"`, como siempre). Este script produce:

  - la versión española en la raíz      (/faq.html, /privacy.html…)
  - la versión inglesa bajo /en/        (/en/faq.html, /en/privacy.html…)

cada una con UN solo idioma en el HTML, su <title>/description/OG propios,
canonical + hreflang recíprocos, JSON-LD por idioma, el selector de idioma
convertido en enlace a la otra URL, y además sitemap.xml, robots.txt y 404.html.

Los .html de la raíz y de /en/ son GENERADOS: se editan las fuentes de _src/.
Jekyll (GitHub Pages) no publica las carpetas que empiezan por «_».
"""
from __future__ import annotations

import datetime as _dt
import html
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "_src")
SITE = "https://0dopamine.com"
LANGS = ("es", "en")
PLAY = "https://play.google.com/store/apps/details?id=com.zerodopamine"
PLAY_WEB = PLAY + "&referrer=utm_source%3D0dopamine.com%26utm_medium%3Dweb"
PLAY_GUIDE = PLAY + "&referrer=utm_source%3D0dopamine.com%26utm_medium%3Dguia"
IG = "https://www.instagram.com/0dopamine_app/"
TT = "https://www.tiktok.com/@0dopamine_app"
OG_IMG = {"es": "/assets/og/og-es.png", "en": "/assets/og/og-en.png"}
OG_ALT = {
    "es": "0Dopamine: bloquea Shorts, Reels y TikTok en Android",
    "en": "0Dopamine: block Shorts, Reels and TikTok on Android",
}
OG_LOCALE = {"es": "es_ES", "en": "en_US"}
HOME_NAME = {"es": "Inicio", "en": "Home"}
GUIDES_NAME = {"es": "Guías", "en": "Guides"}

# ---------------------------------------------------------------------------
# Páginas. `paths` = ruta pública por idioma. `kind`: home | doc | guide | hub
# ---------------------------------------------------------------------------
PAGES = [
    {
        "id": "home", "src": "index.html", "kind": "home",
        "paths": {"es": "/", "en": "/en/"},
        "title": {
            "es": "0Dopamine: bloquea Shorts, Reels y TikTok en Android | Gratis",
            "en": "0Dopamine: Block YouTube Shorts, Reels & TikTok on Android",
        },
        "desc": {
            "es": "App gratis para Android que bloquea Shorts de YouTube, Reels de Instagram, TikTok o cualquier app, con una respiración 4-7-8 antes de abrirla. Horarios, límites diarios y bloqueo total. Sin vender tus datos.",
            "en": "Free Android app that blocks YouTube Shorts, Instagram Reels, TikTok or any app, with a 4-7-8 breath before you open it. Schedules, daily limits and full blocks. We never sell your data.",
        },
        "robots": "index, follow, max-image-preview:large, max-snippet:-1",
    },
    {
        "id": "guides", "src": "guias.html", "kind": "hub",
        "paths": {"es": "/guias.html", "en": "/en/guides.html"},
        "title": {
            "es": "Guías para dejar el scroll infinito en Android — 0Dopamine",
            "en": "Guides to quit endless scrolling on Android — 0Dopamine",
        },
        "desc": {
            "es": "Guías prácticas para bloquear Shorts, Reels y TikTok en Android, comparar con Bienestar Digital y hacer un detox de dopamina realista.",
            "en": "Practical guides to block Shorts, Reels and TikTok on Android, compare with Digital Wellbeing and do a realistic dopamine detox.",
        },
        "crumb": {"es": "Guías", "en": "Guides"},
    },
    {
        "id": "shorts", "src": "guias/bloquear-shorts-youtube.html", "kind": "guide",
        "paths": {"es": "/bloquear-shorts-youtube.html", "en": "/en/block-youtube-shorts.html"},
        "title": {
            "es": "Cómo bloquear los Shorts de YouTube en Android (sin root) — 0Dopamine",
            "en": "How to Block YouTube Shorts on Android (No Root) — 0Dopamine",
        },
        "desc": {
            "es": "Quita los Shorts de YouTube en Android sin desinstalar la app ni root: qué opciones trae YouTube, sus límites y cómo bloquear solo los Shorts con 0Dopamine.",
            "en": "Get rid of YouTube Shorts on Android without uninstalling YouTube or rooting: what YouTube offers, its limits, and how to block only Shorts with 0Dopamine.",
        },
        "crumb": {"es": "Bloquear Shorts de YouTube", "en": "Block YouTube Shorts"},
        "published": "2026-11-10",
    },
    {
        "id": "reels", "src": "guias/bloquear-reels-instagram.html", "kind": "guide",
        "paths": {"es": "/bloquear-reels-instagram.html", "en": "/en/block-instagram-reels.html"},
        "title": {
            "es": "Cómo bloquear los Reels de Instagram en Android — 0Dopamine",
            "en": "How to Block Instagram Reels on Android — 0Dopamine",
        },
        "desc": {
            "es": "Bloquea los Reels de Instagram (y de Facebook) sin perder los mensajes ni el feed. Por qué Instagram no deja quitarlos y cómo hacerlo en Android con 0Dopamine.",
            "en": "Block Instagram (and Facebook) Reels without losing DMs or your feed. Why Instagram won't let you turn them off, and how to do it on Android with 0Dopamine.",
        },
        "crumb": {"es": "Bloquear Reels de Instagram", "en": "Block Instagram Reels"},
        "published": "2026-11-10",
    },
    {
        "id": "tiktok", "src": "guias/limitar-tiktok.html", "kind": "guide",
        "paths": {"es": "/limitar-tiktok.html", "en": "/en/limit-tiktok.html"},
        "title": {
            "es": "Cómo limitar o bloquear TikTok en Android — 0Dopamine",
            "en": "How to Limit or Block TikTok on Android — 0Dopamine",
        },
        "desc": {
            "es": "Pon un límite diario a TikTok, bloquéalo por horario o añade una pausa antes de abrirlo. Las opciones de TikTok y Android, y cómo hacerlo de verdad con 0Dopamine.",
            "en": "Set a daily TikTok limit, block it on a schedule, or add a pause before it opens. TikTok's and Android's own options, and how to make it stick with 0Dopamine.",
        },
        "crumb": {"es": "Limitar TikTok", "en": "Limit TikTok"},
        "published": "2026-11-10",
    },
    {
        "id": "wellbeing", "src": "guias/alternativa-bienestar-digital.html", "kind": "guide",
        "paths": {"es": "/alternativa-bienestar-digital.html", "en": "/en/digital-wellbeing-alternative.html"},
        "title": {
            "es": "Alternativa a Bienestar Digital de Google: comparativa — 0Dopamine",
            "en": "Google Digital Wellbeing Alternative: Comparison — 0Dopamine",
        },
        "desc": {
            "es": "Qué hace Bienestar Digital de Android, dónde se queda corto y en qué se diferencia 0Dopamine: bloqueo de Shorts y Reels dentro de la app, pausas y respiración.",
            "en": "What Android's Digital Wellbeing does, where it falls short, and how 0Dopamine differs: blocking Shorts and Reels inside the app, pauses and breathing.",
        },
        "crumb": {"es": "Alternativa a Bienestar Digital", "en": "Digital Wellbeing alternative"},
        "published": "2026-11-10",
    },
    {
        "id": "detox", "src": "guias/detox-dopamina.html", "kind": "guide",
        "paths": {"es": "/detox-dopamina.html", "en": "/en/dopamine-detox.html"},
        "title": {
            "es": "Detox de dopamina con el móvil: una guía realista — 0Dopamine",
            "en": "Dopamine Detox for Your Phone: A Realistic Guide — 0Dopamine",
        },
        "desc": {
            "es": "Qué es (y qué no es) el detox de dopamina, por qué el vídeo corto engancha tanto y un plan de 7 días para usar menos el móvil sin depender de la fuerza de voluntad.",
            "en": "What a dopamine detox is (and isn't), why short video is so hooking, and a 7-day plan to use your phone less without relying on willpower.",
        },
        "crumb": {"es": "Detox de dopamina", "en": "Dopamine detox"},
        "published": "2026-11-10",
    },
    {
        "id": "faq", "src": "faq.html", "kind": "doc",
        "paths": {"es": "/faq.html", "en": "/en/faq.html"},
        "title": {
            "es": "Preguntas frecuentes — 0Dopamine (0D) para Android",
            "en": "FAQ — 0Dopamine (0D) for Android",
        },
        "desc": {
            "es": "Preguntas frecuentes sobre 0D: cómo bloquear Shorts en YouTube, Reels en Instagram y TikTok en Android. Permisos, privacidad, root y diferencias con Bienestar Digital.",
            "en": "Frequently asked questions about 0D: how to block YouTube Shorts, Instagram Reels and TikTok on Android. Permissions, privacy, root and how it differs from Digital Wellbeing.",
        },
        "crumb": {"es": "FAQ", "en": "FAQ"},
    },
    {
        "id": "install", "src": "install.html", "kind": "doc",
        "paths": {"es": "/install.html", "en": "/en/install.html"},
        "title": {
            "es": "Descargar 0Dopamine gratis en Google Play (Android)",
            "en": "Download 0Dopamine free on Google Play (Android)",
        },
        "desc": {
            "es": "Descarga 0Dopamine gratis desde Google Play y déjalo listo en un minuto: instala, activa el permiso de accesibilidad y elige qué apps frenar.",
            "en": "Download 0Dopamine free from Google Play and set it up in a minute: install, turn on the accessibility permission and choose which apps to slow down.",
        },
        "crumb": {"es": "Descargar", "en": "Download"},
    },
    {
        "id": "privacy", "src": "privacy.html", "kind": "doc",
        "paths": {"es": "/privacy.html", "en": "/en/privacy.html"},
        "title": {
            "es": "Política de privacidad — 0Dopamine (0D)",
            "en": "Privacy policy — 0Dopamine (0D)",
        },
        "desc": {
            "es": "Política de privacidad de 0Dopamine (0D): qué se queda en tu móvil, qué datos de la cuenta opcional, compras, anuncios y fallos se procesan, y cómo borrarlos.",
            "en": "0Dopamine (0D) privacy policy: what stays on your phone, what data from the optional account, purchases, ads and crashes is processed, and how to delete it.",
        },
        "crumb": {"es": "Privacidad", "en": "Privacy"},
        "og_type": "article",
    },
    {
        "id": "terms", "src": "terms.html", "kind": "doc",
        "paths": {"es": "/terms.html", "en": "/en/terms.html"},
        "title": {
            "es": "Términos de uso — 0Dopamine (0D)",
            "en": "Terms of use — 0Dopamine (0D)",
        },
        "desc": {
            "es": "Términos y condiciones de uso de 0Dopamine (0D), app Android de bienestar digital: disponible en Google Play, pago a través de Google Play, legislación española.",
            "en": "Terms and conditions of use of 0Dopamine (0D), a digital wellbeing app for Android: available on Google Play, payments through Google Play, Spanish law.",
        },
        "crumb": {"es": "Términos", "en": "Terms"},
        "og_type": "article",
    },
    {
        "id": "delete", "src": "delete-account.html", "kind": "doc",
        "paths": {"es": "/delete-account.html", "en": "/en/delete-account.html"},
        "title": {
            "es": "Eliminar tu cuenta — 0Dopamine (0D)",
            "en": "Delete your account — 0Dopamine (0D)",
        },
        "desc": {
            "es": "Cómo eliminar tu cuenta de 0Dopamine y sus datos, desde la app o por correo, y qué se borra.",
            "en": "How to delete your 0Dopamine account and its data, from the app or by email, and what gets deleted.",
        },
        "crumb": {"es": "Eliminar cuenta", "en": "Delete account"},
        "og_type": "article",
    },
]
BY_ID = {p["id"]: p for p in PAGES}
# Enlaces en las fuentes: se escriben con el nombre de archivo ESPAÑOL
# (faq.html, bloquear-shorts-youtube.html…) y aquí se traducen por idioma.
HREF_TO_ID = {"": "home", "index.html": "home"}
for _p in PAGES:
    if _p["id"] != "home":
        HREF_TO_ID[_p["paths"]["es"].lstrip("/")] = _p["id"]

MESES_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
            "septiembre", "octubre", "noviembre", "diciembre"]
MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August",
             "September", "October", "November", "December"]
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}
RAW = {"script", "style"}
TAG_RE = re.compile(r"<!--.*?-->|<(/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\"[^\"]*\"|'[^']*'|[^'\">])*)>", re.S)


def url(page_id: str, lang: str) -> str:
    return SITE + BY_ID[page_id]["paths"][lang]


# ---------------------------------------------------------------------------
# Quitar los elementos del otro idioma
# ---------------------------------------------------------------------------
def strip_lang(src: str, drop: str) -> str:
    """Elimina todo elemento con data-lang="<drop>" (con su contenido)."""
    out, i, n = [], 0, len(src)
    attr_re = re.compile(r'\sdata-lang\s*=\s*["\']' + drop + r'["\']')
    while True:
        m = TAG_RE.search(src, i)
        if not m:
            out.append(src[i:])
            break
        if m.group(0).startswith("<!--") or m.group(1):
            out.append(src[i:m.end()])
            i = m.end()
            continue
        name = m.group(2).lower()
        attrs = m.group(3) or ""
        if not attr_re.search(attrs):
            out.append(src[i:m.end()])
            i = m.end()
            if name in RAW:  # saltar el contenido crudo
                close = re.compile(r"</" + name + r"\s*>", re.I).search(src, i)
                out.append(src[i:close.end()])
                i = close.end()
            continue
        # Elemento a eliminar
        out.append(src[i:m.start()])
        if name in VOID or attrs.rstrip().endswith("/"):
            i = m.end()
            continue
        if name in RAW:
            close = re.compile(r"</" + name + r"\s*>", re.I).search(src, m.end())
            i = close.end()
            continue
        depth, j = 1, m.end()
        while depth:
            t = TAG_RE.search(src, j)
            if not t:
                raise ValueError(f"<{name}> sin cerrar cerca de: {src[m.start():m.start()+120]!r}")
            j = t.end()
            if t.group(0).startswith("<!--"):
                continue
            tn = t.group(2).lower()
            if tn in RAW and not t.group(1):
                close = re.compile(r"</" + tn + r"\s*>", re.I).search(src, j)
                j = close.end()
                continue
            if tn != name:
                continue
            if t.group(1):
                depth -= 1
            elif not (t.group(3) or "").rstrip().endswith("/"):
                depth += 1
        i = j
    res = "".join(out)
    # Las líneas que se han quedado vacías tras quitar un bloque
    return re.sub(r"\n[ \t]+\n", "\n", res)


# ---------------------------------------------------------------------------
# Cabecera SEO
# ---------------------------------------------------------------------------
HEAD_DROP = [
    r"\s*<title>.*?</title>",
    r'\s*<meta\s+name="(?:description|robots|twitter:[a-z:]+)"[^>]*>',
    r'\s*<meta\s+property="og:[a-z:_]+"[^>]*>',
    r'\s*<link\s+rel="(?:canonical|alternate)"[^>]*>',
    r'\s*<link\s+rel="preconnect"\s+href="https://fonts\.(?:googleapis|gstatic)\.com"[^>]*>',
    r'\s*<link\s+rel="stylesheet"\s+href="https://fonts\.googleapis\.com[^"]*"[^>]*>',
]


def esc(s: str) -> str:
    return html.escape(s, quote=True)


def seo_head(page: dict, lang: str) -> str:
    other = "en" if lang == "es" else "es"
    t, d = page["title"][lang], page["desc"][lang]
    can = url(page["id"], lang)
    og_type = page.get("og_type", "article" if page["kind"] == "guide" else "website")
    robots = page.get("robots", "index, follow, max-image-preview:large")
    img = SITE + OG_IMG[lang]
    lines = [
        f"<title>{esc(t)}</title>",
        f'<meta name="description" content="{esc(d)}" />',
        f'<meta name="robots" content="{robots}" />',
        f'<link rel="canonical" href="{can}" />',
        f'<link rel="alternate" hreflang="es" href="{url(page["id"], "es")}" />',
        f'<link rel="alternate" hreflang="en" href="{url(page["id"], "en")}" />',
        f'<link rel="alternate" hreflang="x-default" href="{url(page["id"], "es")}" />',
        f'<meta property="og:type" content="{og_type}" />',
        '<meta property="og:site_name" content="0Dopamine" />',
        f'<meta property="og:title" content="{esc(t)}" />',
        f'<meta property="og:description" content="{esc(d)}" />',
        f'<meta property="og:url" content="{can}" />',
        f'<meta property="og:image" content="{img}" />',
        '<meta property="og:image:width" content="1200" />',
        '<meta property="og:image:height" content="630" />',
        f'<meta property="og:image:alt" content="{esc(OG_ALT[lang])}" />',
        f'<meta property="og:locale" content="{OG_LOCALE[lang]}" />',
        f'<meta property="og:locale:alternate" content="{OG_LOCALE[other]}" />',
        '<meta name="twitter:card" content="summary_large_image" />',
        f'<meta name="twitter:title" content="{esc(t)}" />',
        f'<meta name="twitter:description" content="{esc(d)}" />',
        f'<meta name="twitter:image" content="{img}" />',
        f'<meta name="twitter:image:alt" content="{esc(OG_ALT[lang])}" />',
        '<link rel="preload" href="/assets/fonts/baloo2-latin.woff2" as="font" type="font/woff2" crossorigin />',
        '<link rel="preload" href="/assets/fonts/quicksand-latin.woff2" as="font" type="font/woff2" crossorigin />',
        '<link rel="stylesheet" href="/assets/fonts.css" />',
    ]
    return "\n  " + "\n  ".join(lines)


def ld(obj) -> str:
    return '<script type="application/ld+json">\n' + json.dumps(obj, ensure_ascii=False, indent=2) + "\n</script>"


def org_node():
    return {
        "@type": "Organization", "@id": SITE + "/#org",
        "name": "0Dopamine", "alternateName": ["0D", "Zero Dopamine"],
        "url": SITE + "/", "logo": SITE + "/assets/logo-512.png",
        "email": "hola@0dopamine.com",
        "sameAs": [PLAY, IG, TT],
    }


def jsonld(page: dict, lang: str, lastmod: str) -> str:
    blocks = []
    if page["kind"] == "home":
        offers = [
            {"@type": "Offer", "name": "Free", "price": "0", "priceCurrency": "EUR"},
            {"@type": "Offer", "name": "Premium", "price": "1", "priceCurrency": "EUR",
             "priceSpecification": {"@type": "UnitPriceSpecification", "price": "1", "priceCurrency": "EUR",
                                    "billingDuration": "P1M", "unitCode": "MON"}},
            {"@type": "Offer", "name": "Lifetime", "price": "59.99", "priceCurrency": "EUR"},
        ]
        for o in offers:
            o["availability"] = "https://schema.org/InStock"
        blocks.append(ld({
            "@context": "https://schema.org",
            "@graph": [
                org_node(),
                {
                    "@type": "WebSite", "@id": SITE + "/#website", "url": SITE + "/",
                    "name": "0Dopamine", "alternateName": ["0D", "Zero Dopamine"],
                    "inLanguage": ["es", "en"], "publisher": {"@id": SITE + "/#org"},
                },
                {
                    "@type": "MobileApplication", "@id": SITE + "/#app",
                    "name": "0Dopamine", "alternateName": ["0D", "Zero Dopamine"],
                    "description": page["desc"][lang],
                    "url": url("home", lang), "inLanguage": lang,
                    "operatingSystem": "Android 8.0+",
                    "applicationCategory": "UtilitiesApplication",
                    "applicationSubCategory": "Digital wellbeing",
                    "downloadUrl": PLAY, "installUrl": PLAY,
                    "datePublished": "2026-11-08",
                    "image": SITE + "/assets/logo-512.png",
                    "screenshot": [SITE + "/assets/img/app-inicio-oscuro.webp", SITE + "/assets/img/app-inicio-claro.webp"],
                    "publisher": {"@id": SITE + "/#org"}, "author": {"@id": SITE + "/#org"},
                    "offers": offers,
                },
            ],
        }))
        return "\n  ".join(blocks)

    crumbs = [{"name": HOME_NAME[lang], "item": url("home", lang)}]
    if page["kind"] == "guide":
        crumbs.append({"name": GUIDES_NAME[lang], "item": url("guides", lang)})
    crumbs.append({"name": page["crumb"][lang], "item": url(page["id"], lang)})
    blocks.append(ld({
        "@context": "https://schema.org", "@type": "BreadcrumbList",
        "itemListElement": [dict({"@type": "ListItem", "position": i + 1}, **c) for i, c in enumerate(crumbs)],
    }))
    if page["kind"] == "guide":
        blocks.append(ld({
            "@context": "https://schema.org", "@type": "Article",
            "headline": page["title"][lang].split(" — ")[0],
            "description": page["desc"][lang], "inLanguage": lang,
            "mainEntityOfPage": url(page["id"], lang),
            "image": [SITE + OG_IMG[lang], SITE + "/assets/img/app-inicio-oscuro.webp"],
            "datePublished": page["published"], "dateModified": max(lastmod, page["published"]),
            "author": {"@type": "Organization", "name": "0Dopamine", "url": SITE + "/"},
            "publisher": {"@type": "Organization", "name": "0Dopamine", "logo": {"@type": "ImageObject", "url": SITE + "/assets/logo-512.png"}},
            "about": {"@type": "MobileApplication", "name": "0Dopamine", "operatingSystem": "Android", "applicationCategory": "UtilitiesApplication", "url": url("home", lang)},
        }))
    return "\n  ".join(blocks)


# ---------------------------------------------------------------------------
# Enlaces y selector de idioma
# ---------------------------------------------------------------------------
def rewrite_links(doc: str, lang: str) -> str:
    def fix(m):
        attr, val = m.group(1), m.group(2)
        if val.startswith("assets/"):
            return f'{attr}="/{val}"'
        if val in ("{{PLAY}}",):
            return f'{attr}="{PLAY_GUIDE}"'
        base, frag = (val.split("#", 1) + [""])[:2]
        key = base.lstrip("/")
        if base.startswith(("http", "mailto:", "{{")) or (base and key not in HREF_TO_ID):
            return m.group(0)
        if not base:
            return m.group(0)  # ancla interna (#main)
        target = BY_ID[HREF_TO_ID[key]]["paths"][lang]
        return f'{attr}="{target}' + (f"#{frag}" if frag else "") + '"'
    return re.sub(r'\b(href|src)="([^"]*)"', fix, doc)


def lang_switch(doc: str, page: dict, lang: str) -> str:
    # {{ABS:…}}: rewrite_links() no toca estas rutas (ya son las definitivas).
    es_u, en_u = "{{ABS:%s}}" % page["paths"]["es"], "{{ABS:%s}}" % page["paths"]["en"]
    other = "en" if lang == "es" else "es"
    other_u = "{{ABS:%s}}" % page["paths"][other]
    label = "Read in English" if lang == "es" else "Leer en español"
    # Portada: botón único EN / ES
    doc = re.sub(
        r'<button type="button" class="lang-switch" data-lang-toggle([^>]*)>(.*?)</button>',
        lambda m: f'<a class="lang-switch" href="{other_u}" hreflang="{other}" lang="{other}" aria-label="{label}">{m.group(2)}</a>',
        doc, flags=re.S)

    # Páginas de texto: dos «botones» → dos enlaces
    def pills(_m):
        cur_es = ' aria-current="page"' if lang == "es" else ""
        cur_en = ' aria-current="page"' if lang == "en" else ""
        return (f'<nav class="lang-toggle" aria-label="Idioma / Language">\n'
                f'          <a href="{es_u}" hreflang="es" lang="es"{cur_es}>ES</a>\n'
                f'          <a href="{en_u}" hreflang="en" lang="en"{cur_en}>EN</a>\n'
                f'        </nav>')
    doc = re.sub(r'<div class="lang-toggle"[^>]*>.*?</div>', pills, doc, count=1, flags=re.S)
    return doc


# ---------------------------------------------------------------------------
def git_lastmod(*paths: str) -> str:
    dates = []
    for p in paths:
        try:
            out = subprocess.run(["git", "-C", ROOT, "log", "-1", "--format=%cs", "--", p],
                                 capture_output=True, text=True, check=True).stdout.strip()
        except Exception:
            out = ""
        dirty = subprocess.run(["git", "-C", ROOT, "status", "--porcelain", "--", p],
                               capture_output=True, text=True).stdout.strip()
        dates.append(_dt.date.today().isoformat() if (dirty or not out) else out)
    return max(dates)


def load_source(page: dict) -> str:
    raw = open(os.path.join(SRC, page["src"]), encoding="utf-8").read()
    if page["kind"] in ("guide", "hub"):
        layout = open(os.path.join(SRC, "_layout-guia.html"), encoding="utf-8").read()
        raw = layout.replace("{{CONTENT}}", raw.rstrip())
    return raw


def render(page: dict, lang: str, lastmod: str) -> str:
    other = "en" if lang == "es" else "es"
    doc = load_source(page)
    doc = lang_switch(doc, page, lang)
    doc = strip_lang(doc, other)
    doc = re.sub(r'<html lang="[a-z]+"', f'<html lang="{lang}"', doc, count=1)

    head_end = doc.index("</head>")
    head, body = doc[:head_end], doc[head_end:]
    for pat in HEAD_DROP:
        head = re.sub(pat, "", head, flags=re.S)
    # JSON-LD propio de la página: fuera los bloques de migas/app/organización
    # escritos a mano; se mantienen los demás (FAQPage del idioma).
    def keep_ld(m):
        body_ = m.group(0)
        if re.search(r'"@type":\s*"(BreadcrumbList|SoftwareApplication|Organization)"', body_):
            return ""
        return body_
    head = re.sub(r'\s*<script type="application/ld\+json"[^>]*>.*?</script>', keep_ld, head, flags=re.S)
    head = re.sub(r'(<meta name="viewport"[^>]*>)', lambda m: m.group(1) + seo_head(page, lang), head, count=1)
    head = head.rstrip() + "\n  " + jsonld(page, lang, lastmod) + "\n"
    doc = head + body
    doc = rewrite_links(doc, lang)
    doc = re.sub(r"\{\{ABS:([^}]*)\}\}", r"\1", doc)
    y, mo, d = (int(x) for x in lastmod.split("-"))
    human = (f"{d} de {MESES_ES[mo - 1]} de {y}" if lang == "es"
             else f"{MONTHS_EN[mo - 1]} {d}, {y}")
    doc = re.sub(r'(<time datetime="\{\{LASTMOD\}\}">)\{\{LASTMOD\}\}', r"\g<1>" + human, doc)
    doc = doc.replace("{{LASTMOD}}", lastmod)
    banner = f"<!-- GENERADO por _tools/build.py desde _src/{page['src']} ({lang}). No editar aquí: editar la fuente y volver a generar. -->\n"
    doc = doc.replace("<!DOCTYPE html>\n", "<!DOCTYPE html>\n" + banner, 1)
    return re.sub(r"\n{3,}", "\n\n", doc)


def out_path(public: str) -> str:
    p = public.lstrip("/")
    if p == "" or p.endswith("/"):
        p += "index.html"
    return os.path.join(ROOT, p)


def build_sitemap(lastmods: dict) -> str:
    rows = []
    for page in PAGES:
        for lang in LANGS:
            alts = "".join(
                f'\n    <xhtml:link rel="alternate" hreflang="{l}" href="{url(page["id"], l)}"/>' for l in LANGS)
            alts += f'\n    <xhtml:link rel="alternate" hreflang="x-default" href="{url(page["id"], "es")}"/>'
            rows.append(f"  <url>\n    <loc>{url(page['id'], lang)}</loc>\n    <lastmod>{lastmods[page['id']]}</lastmod>{alts}\n  </url>")
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
            + "\n".join(rows) + "\n</urlset>\n")


def main() -> int:
    written = []
    lastmods = {}
    for page in PAGES:
        srcs = ["_src/" + page["src"]]
        if page["kind"] in ("guide", "hub"):
            srcs.append("_src/_layout-guia.html")
        lastmods[page["id"]] = git_lastmod(*srcs)
        for lang in LANGS:
            html_out = render(page, lang, lastmods[page["id"]])
            path = out_path(page["paths"][lang])
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w", encoding="utf-8") as f:
                f.write(html_out)
            written.append(os.path.relpath(path, ROOT))
    with open(os.path.join(ROOT, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write(build_sitemap(lastmods))
    with open(os.path.join(ROOT, "robots.txt"), "w", encoding="utf-8") as f:
        f.write("User-agent: *\nAllow: /\n\nSitemap: https://0dopamine.com/sitemap.xml\n")
    p404 = open(os.path.join(SRC, "404.html"), encoding="utf-8").read()
    with open(os.path.join(ROOT, "404.html"), "w", encoding="utf-8") as f:
        f.write(p404.replace('href="assets/', 'href="/assets/').replace('src="assets/', 'src="/assets/'))
    written += ["sitemap.xml", "robots.txt", "404.html"]
    print("\n".join(written))
    return 0


if __name__ == "__main__":
    sys.exit(main())
