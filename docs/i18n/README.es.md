<p align="center"><a href="https://reevesagents.mertkayacs.com/es/"><img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-banner.png" width="800" alt="ReevesAgents: ejecuta asistentes de programación con IA en equipo"></a></p>

# reevesagents: un espacio de trabajo para herramientas de programación con IA

Ejecuta Claude Code, Codex, Kimi, OpenCode, Hermes y otras herramientas de programación con IA una junto a otra en tu ordenador. reevesagents reúne sus sesiones de terminal para que revises el trabajo de cada herramienta, envíes instrucciones y detengas un run desde un solo sitio.

<img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-hero.webp" width="720" alt="Un panel principal con marco dorado unido por finos hilos de oro a ocho paneles de cristal iluminados, uno por cada herramienta del run">

[Ver la demo](https://reevesagents.mertkayacs.com/es/demo/) o instalar la herramienta de línea de comandos más abajo.

## Inicio rápido

Necesitas Node.js 20.19 o posterior, tmux 3.0 o posterior y una herramienta de programación con IA instalada y con la sesión iniciada. Funciona en macOS, Linux y WSL. tmux mantiene las herramientas en marcha aunque cierres la interfaz.

```sh
npm install -g reevesagents && reevesagents doctor && reevesagents
```

Esto abre la interfaz de terminal. Para la interfaz de navegador, ejecuta `reevesagents web`; solo escucha en la dirección loopback de tu ordenador.

## Lanzar un equipo

Inicia un run con una tarea para las herramientas:

```sh
reevesagents spawn claude-code:lead codex:tests --name "review" --prompt "Revisa el código y las pruebas."
```

Usa la interfaz de terminal o de navegador para leer la salida y dirigir cada herramienta. Cada proveedor mantiene su propio inicio de sesión y envía sus propias peticiones al modelo. El estado de los runs se guarda como JSON en `~/.reeves`.

<img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-newrun-es.png" width="720" alt="Web UI de reevesagents al iniciar un run nuevo: nombre del run, selección de herramientas como Claude Code, Codex CLI y Kimi Code, un modelo y un modo de permisos">

## Una herramienta dirige a las demás

Conecta el servidor MCP opcional (Model Context Protocol, una conexión estándar entre herramientas de IA) a un host de confianza:

```sh
reevesagents attach claude && reevesagents hosts
```

Reinicia ese host para que cargue la conexión. A partir de ahí puede iniciar, leer, dirigir y detener otras herramientas. Por defecto, los workers no reciben conexión MCP. Mantén activadas las solicitudes de permiso de los proveedores y revisa las aprobaciones antes de cualquier acción delicada.

En Claude Code puedes instalar la conexión y sus instrucciones de uso juntas como plugin:

```sh
claude plugin marketplace add mertkayacs/reevesagents
claude plugin install reevesagents@reevesagents
```

Para otros hosts, el [skill de reevesagents](https://github.com/mertkayacs/reevesagents-skill) aporta las instrucciones de uso. Consulta la [referencia MCP](../mcp.md) para ver las herramientas y los requisitos de cada host.

El servidor aparece en el [registro oficial de MCP](https://registry.modelcontextprotocol.io/?q=io.github.mertkayacs/reevesagents) como `io.github.mertkayacs/reevesagents`.

<img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-steer.webp" width="560" alt="Un panel principal con marco dorado envía mensajes por hilos de oro a otros tres paneles">

## Elige una interfaz

| Interfaz | Para qué sirve |
| --- | --- |
| Interfaz de terminal | Revisar y controlar runs con el teclado |
| Web UI | Revisar runs, salida en directo, aprobaciones e historial en el navegador |
| Línea de comandos | Iniciar runs y leer la salida desde scripts |
| Servidor MCP | Dejar que una herramienta de programación con IA de confianza dirija un equipo |

<details>
<summary>Captura de la Web UI</summary>

<img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-web-es.png" width="720" alt="Web UI de reevesagents antes de cualquier run: lista de agentes vacía, botones de Nuevo run y controles de idioma y ajustes">

</details>

## Documentación

- [Guía de uso](https://reevesagents.mertkayacs.com/es/docs/): instalación, comandos y configuración.
- [Preguntas frecuentes](https://reevesagents.mertkayacs.com/es/faq/): configuración de proveedores y solución de problemas.
- [Referencia MCP](../mcp.md): herramientas y conexiones de hosts (en inglés).
- [Cómo contribuir](../../.github/CONTRIBUTING.md), [pruebas](../testing.md) y [registro de cambios](../../CHANGELOG.md) (en inglés).

Otros idiomas: [English](../../README.md), [Deutsch](README.de.md), [Français](README.fr.md), [Português](README.pt.md), [Italiano](README.it.md), [Türkçe](README.tr.md), [Русский](README.ru.md), [简体中文](README.zh-Hans.md), [العربية](README.ar.md).

## Licencia

[Apache-2.0](../../LICENSE). Disponible en [npm](https://www.npmjs.com/package/reevesagents).

<a href="https://eschatialabs.com"><picture><source media="(prefers-color-scheme: dark) and (min-resolution: 2dppx)" srcset="https://eschatialabs.com/brand/lockup-46-dark@2x.png"><source media="(prefers-color-scheme: dark)" srcset="https://eschatialabs.com/brand/lockup-46-dark@1x.png"><source media="(min-resolution: 2dppx)" srcset="https://eschatialabs.com/brand/lockup-46@2x.png"><img src="https://eschatialabs.com/brand/lockup-46@1x.png" width="124" height="46" alt="Eschatia Labs"></picture></a><br>Un proyecto de [Eschatia Labs](https://eschatialabs.com) creado por [Mert Kaya](https://mertkayacs.com).
