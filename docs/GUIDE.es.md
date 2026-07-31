# Guía del usuario de ReevesAgents

[English](GUIDE.md) · [Deutsch](GUIDE.de.md) · [Français](GUIDE.fr.md) · **Español** · [Português](GUIDE.pt.md) · [Italiano](GUIDE.it.md) · [Türkçe](GUIDE.tr.md) · [Русский](GUIDE.ru.md) · [简体中文](GUIDE.zh-Hans.md) · [العربية](GUIDE.ar.md)

Esta guía te lleva desde una instalación limpia hasta el punto en que un agente
ejecuta a los demás por ti. Cuando lo que necesites sea cada comando y cada
opción, eso vive en el [README](i18n/README.es.md).

## Qué es ReevesAgents

- Un espacio de trabajo gratuito y local donde tus agentes de codificación de
  IA (Claude Code, Codex, Hermes, DeepSeek, Kimi y más) trabajan codo con codo
  en tu máquina.
- Un agente puede crear y dirigir a los demás por MCP. Por ejemplo, una sesión
  de Claude Code puede ejecutar agentes de Codex y Claude Code en tareas
  separadas.
- También puedes usar ReevesAgents como un espacio de trabajo normal: genera los
  agentes que quieras y sigue añadiendo más con `reevesagents add`. Están codo
  con codo, y nadie controla a nadie hasta que optas por el MCP.
- Se apoya en las CLI que ya tienes, así que cada inicio de sesión se queda
  donde siempre ha estado. ReevesAgents nunca guarda una clave de API y nunca
  toca el tráfico de tus modelos.
- Todo su estado es un poco de JSON bajo `~/.reeves`. No hay base de datos que
  levantar, ni Docker que descargar, ni nada rondando en segundo plano.

## Antes de empezar

- macOS, Linux o WSL (Windows nativo no es el objetivo; usa WSL).
- Node.js 20.19 o superior.
- tmux 3.0 o superior.
- Al menos una CLI de proveedor instalada y autenticada: Claude Code, Codex,
  OpenCode, Hermes, Kimi, DeepSeek, Pi, Qwen o Aider.

## Instalar y comprobar

- Instálalo con Homebrew: `brew install mertkayacs/reevesagents/reevesagents`, o
  de forma global con un gestor de paquetes de Node como pnpm: `pnpm add -g reevesagents`
- Comprueba tu máquina: `reevesagents doctor` (verifica Node, tmux, la carpeta
  de estado y qué CLI de proveedor puede ver).
- Lánzalo: `reevesagents`
- ¿Prefieres npm, Yarn, Bun o npx? Consulta
  [Instalación](i18n/README.es.md#instalación) en el README.

## Tu primer run

El run más rápido de reproducir sale de la línea de comandos. Un run tiene un
agente principal (lead) y cualquier número de trabajadores (workers); cada agente
se escribe como `provider[:nickname[:model]]`:

```sh
reevesagents spawn claude-code:lead codex:worker \
  --name "first run" \
  --prompt "Say hello and list the files in this folder."
```

- `claude-code:lead` es el principal, `codex:worker` es un trabajador. Si no
  nombras ningún agente, el run usa `codex` por defecto.
- `--name` etiqueta el run, `--cwd` establece la carpeta de trabajo (por defecto
  donde estás), y `--prompt` se pega en cada agente.

¿Prefieres un inicio visual? Ejecuta `reevesagents` para la TUI o
`reevesagents web` para la Web UI local y crea el run desde allí.

¿No quieres planificar todo el equipo de antemano? Genera un agente y haz crecer
el espacio de trabajo sobre la marcha. `add` se une a tu run más reciente, así
que no hay ningún id de run que andar copiando:

```sh
reevesagents spawn claude-code:lead
reevesagents add codex:worker
```

## Las cinco formas de usarlo

Accedes a los mismos runs a través de cinco superficies. Elige la que se ajuste
al momento:

- **TUI** (`reevesagents`): la aplicación de terminal en la que la mayoría acaba
  viviendo. Todo es un menú, así que con las flechas te basta.
- **Web UI** (`reevesagents web`): los mismos runs en una página del navegador,
  con una vista en vivo de cualquier agente. Nunca responde fuera del loopback.
- **CLI** (`reevesagents spawn`, `runs`, `peek`, `open`, `stop`): para scripts,
  o para los días en que prefieres teclear a navegar.
- **tmux**: donde viven los agentes en realidad. Como cada uno es una CLI real
  en su propio panel, cerrar la TUI o la Web UI no interrumpe a nadie.
- **Agent control** (`reevesagents attach <cli>`): el MCP opt-in que permite a
  un agente dirigir al resto. La siguiente sección lo explica paso a paso.

## Deja que un agente dirija a los otros

Esta es la característica principal, y permanece desactivada hasta que la
actives.

- Actívala para tu CLI con `reevesagents attach claude`, o ejecuta un
  `reevesagents attach` a secas para conectar todas las CLI instaladas que
  puedan alojarlo. La pantalla **Agent control** de la TUI y la Web UI hace
  exactamente lo mismo.
- `reevesagents hosts` te dice cómo vas: todas las CLI de la máquina, y cuáles
  de ellas están conectadas.
- Después reinicia esa CLI una vez, porque las herramientas solo se cargan al
  arrancar la sesión (esto es MCP normal y corriente, la forma estándar de que
  una herramienta de agente exponga comandos a otra).
- A partir de ahí, tu agente puede poner a un agente nuevo en una tarea,
  escribirle, leer qué está haciendo y aprobar o denegar lo que pida.

Un ejemplo práctico: adjúntalo a Claude Code, reinícialo, y desde una sola
sesión de Claude Code puedes generar un agente Codex en una issue y un segundo
agente Claude Code en otra, y luego observar y dirigir ambos.

- CLI que pueden alojar esto hoy: claude, codex, kimi, qwen, opencode, hermes.
  OpenCode se adjunta a mano, ya que su propio paso de adición es interactivo.
- Los trabajadores no reciben estas herramientas por defecto, así que un
  trabajador no puede generar más agentes. Para que un trabajador dirija sus
  propios subagentes, adjunta el MCP también a la CLI de ese trabajador.
- Para desconectarse más tarde: `reevesagents detach claude`.

## Tareas cotidianas

- Ve qué está en ejecución: `reevesagents runs` (añade `--json` para scripts).
- Observa un agente sin salir de tu shell: `reevesagents peek <agent> -n 40`.
- Salta al panel tmux de un agente: `reevesagents open <agent>`.
- Detén todo un run: `reevesagents stop <run> --yes`.
- Detén un agente individual: `reevesagents kill <agent> --yes`.
- Ve qué están pidiendo los agentes: `reevesagents approvals`, y luego
  `approve <id>` o `deny <id>`.
- `stop` y `kill` terminan trabajo, y los comandos `delete` eliminan registros
  finalizados. Todos se niegan a ejecutarse sin `--yes`.

## Mantener el costo bajo

- Pon delante un modelo barato o gratuito como enrutador, y deja que despierte
  al caro solo cuando una tarea de verdad lo merezca.
- El código rutinario y las pruebas son justo para lo que están los modelos
  baratos. Guárdate el grande para planificar y diseñar, en vez de pagarle por
  escribir boilerplate.
- Lo que esto te cueste es la facturación normal de tus proveedores. ReevesAgents
  no añade nada por su cuenta.

## Cuando algo no va bien

- Empieza por `reevesagents doctor`, porque casi siempre te dice dónde está el
  problema: revisa Node, tmux, la carpeta de estado y cada CLI de proveedor.
- **Falta tmux:** instálalo (`brew install tmux` o `apt install tmux`) y deja
  que doctor lo confirme.
- **Un proveedor no se detecta:** casi siempre está sin instalar o sin sesión
  iniciada. ReevesAgents solo puede lanzar lo que está en tu `PATH` y con la
  sesión abierta.
- **La Web UI reporta paquetes faltantes:** los módulos opcionales `ws` y
  `@lydell/node-pty` se quedaron fuera al instalar. Reinstalar de la forma
  normal los trae de vuelta.
- **El puerto ya está en uso:** no pasa nada; `reevesagents web` toma el
  siguiente puerto libre e imprime la URL. Pasa `--port <n>` si te importa cuál.
- Más detalle en [Resolución de problemas](i18n/README.es.md#resolución-de-problemas).

## Dónde ir después

- [Inicio de la documentación](README.md): el índice completo.
- [Comandos](i18n/README.es.md#comandos): cada subcomando y flag.
- [Agent control](i18n/README.es.md#agent-control): el modelo opt-in completo.
- [Configuración](i18n/README.es.md#configuración): qué vive bajo `~/.reeves`.
- [docs/mcp.md](mcp.md): el diseño de Agent control y la lista de herramientas.
