# Guía del usuario de ReevesAgents

[English](GUIDE.md) · [Deutsch](GUIDE.de.md) · [Français](GUIDE.fr.md) · **Español** · [Português](GUIDE.pt.md) · [Italiano](GUIDE.it.md) · [Türkçe](GUIDE.tr.md) · [Русский](GUIDE.ru.md) · [简体中文](GUIDE.zh-Hans.md) · [العربية](GUIDE.ar.md)

Un recorrido simple paso a paso: instálalo, haz tu primer run, y deja que un
agente dirija a los otros. Para la referencia completa de comandos y opciones,
consulta el [README](../README.es.md).

## Qué es ReevesAgents

- Un espacio de trabajo gratuito y local para agentes de codificación de IA
  (Claude Code, Codex, Hermes, DeepSeek, Kimi y más). Se ejecutan lado a lado
  en tu máquina.
- La idea principal: un agente crea y dirige a los otros. Un agente de Claude
  Code puede iniciar y dirigir un equipo de agentes Codex y Claude Code en
  tareas separadas.
- Se ejecuta encima de las CLI reales que ya tienes. El inicio de sesión del
  proveedor permanece en cada CLI. ReevesAgents no almacena claves de API y
  nunca hace de proxy del tráfico de tu modelo.
- Sin base de datos, sin Docker, sin servicio en segundo plano. El estado es
  JSON local bajo `~/.reeves`.

## Antes de empezar

- macOS, Linux o WSL (Windows nativo no es el objetivo; usa WSL).
- Node.js 20.19 o más nuevo.
- tmux 3.0 o más nuevo.
- Al menos una CLI de proveedor instalada y autenticada: Claude Code, Codex,
  OpenCode, Hermes, Kimi, DeepSeek, Pi, Qwen o Aider.

## Instalar y comprobar

- Instálalo globalmente: `npm install -g reevesagents`
- Comprueba tu máquina: `reevesagents doctor` (verifica Node, tmux, la carpeta
  de estado y qué CLI de proveedor puede ver).
- Lánzalo: `reevesagents`
- ¿Prefieres pnpm, Yarn, Bun, npx o Homebrew? Consulta
  [Instalación](../README.es.md#instalación) en el README.

## Tu primer run

La forma reproducible más rápida es desde la línea de comandos. Un run tiene un
agente principal (lead) y cualquier número de trabajadores (workers); cada agente
se escribe como `provider[:nickname[:model]]`:

```sh
reevesagents spawn claude-code:lead codex:worker \
  --name "first run" \
  --prompt "Say hello and list the files in this folder."
```

- `claude-code:lead` es el principal, `codex:worker` es un trabajador. Sin
  agente nombrado, el run por defecto es `codex`.
- `--name` etiqueta el run, `--cwd` establece la carpeta de trabajo (por defecto
  donde estás), y `--prompt` se pega en cada agente.

¿Prefieres un inicio visual? Ejecuta `reevesagents` para la TUI o
`reevesagents web` para la Web UI local y crea el run desde allí.

## Las cuatro formas de usarlo

Accedes a los mismos runs a través de cuatro superficies. Elige la que se ajuste
al momento:

- **TUI** (`reevesagents`): control rápido centrado en el teclado dentro del
  terminal.
- **Web UI** (`reevesagents web`): una vista visual de runs, agentes, paneles en
  vivo e historial. Local y solo de loopback.
- **CLI** (`reevesagents spawn`, `runs`, `peek`, `open`, `stop`): scripts,
  comandos rápidos y comprobaciones de salud.
- **tmux**: cada agente es una CLI real en su propio panel tmux, así que las
  sesiones siguen ejecutándose localmente incluso después de que cierres la TUI
  o la Web UI.

## Deja que un agente dirija a los otros

Esta es la característica principal, y permanece desactivada hasta que la
actives.

- Actívala para tu CLI: `reevesagents attach claude` (o `reevesagents attach`
  para conectar cada CLI instalada que pueda alojar). También puedes hacer esto
  desde la pantalla **Agent control** en la TUI o Web UI.
- Confírmalo: `reevesagents hosts` lista las CLI en tu máquina y muestra cuáles
  están conectadas.
- Recarga tu CLI: reinicia la sesión para que cargue las nuevas herramientas
  (esto usa MCP, la forma estándar de que una herramienta de agente exponga
  comandos a otra).
- Ahora tu agente puede crear y dirigir otros agentes: inicia un agente en una
  tarea, envíale texto o pulsaciones de teclado, lee qué está haciendo y aprueba
  o deniega lo que solicita.

Un ejemplo trabajado: adjunta a Claude Code, reinicialo, y desde dentro de una
sesión de Claude Code puedes generar un agente Codex en una issue y un segundo
agente Claude Code en otra, luego observa y dirige ambos.

- CLI que pueden alojar esto hoy: claude, codex, kimi, qwen, opencode, hermes.
  OpenCode se adjunta a mano, ya que su propio paso de adición es interactivo.
- Los trabajadores no reciben estas herramientas por defecto, así que un
  trabajador no puede generar más agentes. Para permitir que un trabajador dirija
  sus propios subagentes, adjunta el MCP a la CLI de ese trabajador también.
- Para desconectarse más tarde: `reevesagents detach claude`.

## Tareas cotidianas

- Ve qué está en ejecución: `reevesagents runs` (añade `--json` para scripts).
- Observa un agente sin salir de tu shell: `reevesagents peek <agent> -n 40`.
- Salta al panel tmux de un agente: `reevesagents open <agent>`.
- Detén todo un run: `reevesagents stop <run> --yes`.
- Detén un agente individual: `reevesagents kill <agent> --yes`.
- `stop` y `kill` son los únicos comandos que terminan el trabajo, así que se
  niegan a ejecutarse sin `--yes`.

## Mantener el costo bajo

- Pon un modelo más barato o gratuito al frente para enrutar el trabajo, y deja
  que pase tareas pesadas a un agente más fuerte solo cuando sea necesario.
- Deja que modelos baratos escriban código y pruebas rutinarias mientras planificas
  y diseñas con uno más grande, en lugar de pasar todo a través de un único
  modelo predeterminado caro.
- Las cuotas y facturación de proveedores permanecen en cada CLI. ReevesAgents
  no añade costo propio.

## Cuando algo se ve mal

- Ejecuta `reevesagents doctor` primero. Verifica Node, tmux, la carpeta de
  estado y tus CLI de proveedor, y te dice qué está fallando.
- **tmux falta:** instálalo (`brew install tmux` o `apt install tmux`) y
  ejecuta doctor de nuevo.
- **Un proveedor no se detecta:** ReevesAgents solo lanza CLI que están en tu
  `PATH` e iniciadas sesión. Instala o inicia sesión en esa CLI.
- **Web UI reporta paquetes faltantes:** necesita `ws` y `@lydell/node-pty`.
  Reinstala con dependencias opcionales habilitadas.
- **Puerto ya en uso:** `reevesagents web` inicia en `8080` y recurre al
  siguiente puerto libre; pasa `--port <n>` para elegir otro.
- Más detalle en [Resolución de problemas](../README.es.md#resolución-de-problemas).

## Dónde ir después

- [Inicio de la documentación](README.md): el índice completo de la documentación.
- [Comandos](../README.es.md#comandos): cada subcomando y flag.
- [Agent control](../README.es.md#agent-control): el modelo completo de opt-in.
- [Configuración](../README.es.md#configuración): qué vive bajo `~/.reeves`.
- [docs/mcp.md](mcp.md): el diseño de Agent control y lista de herramientas.
