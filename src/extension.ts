import * as vscode from 'vscode'
import * as path from 'path'
import {Routes} from './routes'

export async function activate(context: vscode.ExtensionContext) {
  let currentPanel: vscode.WebviewPanel | undefined = undefined
  let disposable = vscode.commands.registerCommand(
    'rails-routes-search.open',
    () => {
      if (currentPanel) {
        currentPanel.reveal(vscode.ViewColumn.Two)
        return
      }

      let routes: Routes
      const workspaceFolders = vscode.workspace.workspaceFolders
      if (!workspaceFolders) {
        vscode.window.showErrorMessage(
          'There is no workspace. Open workspace and then retry.',
        )
        return
      }

      currentPanel = vscode.window.createWebviewPanel(
        'railsRoutesNavigator',
        'Rails Routes Search',
        vscode.ViewColumn.Two,
        {
          enableScripts: true,
          localResourceRoots: [
            vscode.Uri.joinPath(context.extensionUri, 'media'),
          ],
        },
      )
      currentPanel.webview.html = getWebviewContent(
        currentPanel.webview,
        context,
      )
      currentPanel.webview.onDidReceiveMessage(
        async (message) => {
          try {
            switch (message.command) {
              case 'search':
                currentPanel?.webview.postMessage({
                  routes: routes.filterWith(message.text).createHtml(),
                })
                break
              case 'showTextDocument':
                const document = await openDocument(
                  workspaceFolders[0],
                  message.filePath,
                )
                const index = await getActionIndex(document, message.action)
                const options: vscode.TextDocumentShowOptions = {
                  viewColumn: vscode.ViewColumn.One,
                  selection: new vscode.Range(
                    new vscode.Position(index, 0),
                    new vscode.Position(index, 0),
                  ),
                }
                vscode.window.showTextDocument(document, options)
                break
              case 'initializeRoutes':
                vscode.window.showErrorMessage(message.text)
                routes = new Routes(workspaceFolders[0])
                await routes.loadRoutes(false)
                currentPanel?.webview.postMessage({routes: routes.createHtml()})
                break
              case 'refreshRoutes':
                await routes.loadRoutes(true)
                currentPanel?.webview.postMessage({routes: routes.createHtml()})
                break
            }
          } catch (error) {
            vscode.window.showErrorMessage(`${error}`)
            return
          }
        },
        undefined,
        context.subscriptions,
      )

      currentPanel.onDidDispose(
        () => (currentPanel = undefined),
        null,
        context.subscriptions,
      )
    },
  )

  context.subscriptions.push(disposable)
}

async function openDocument(
  workspaceFolder: vscode.WorkspaceFolder,
  filePath: string,
) {
  return await vscode.workspace.openTextDocument(
    path.join(workspaceFolder.uri.fsPath, filePath),
  )
}

async function getActionIndex(document: vscode.TextDocument, action: string) {
  const regexp = new RegExp(`^\\s*def\\s+\\b${action}\\b.*$`)
  for (let index = 0; index < document.lineCount; index++) {
    const line = document.lineAt(index)
    if (regexp.test(line.text)) {
      return index
    }
  }
  return 0
}

function getWebviewContent(
  webview: vscode.Webview,
  context: vscode.ExtensionContext,
) {
  // Local path to main script run in the webview
  const scriptPathOnDisk = vscode.Uri.joinPath(
    context.extensionUri,
    'media',
    'script.js',
  )

  // And the uri we use to load this script in the webview
  const scriptUri = webview.asWebviewUri(scriptPathOnDisk)

  // Local path to css styles
  const stylesPathMainPath = vscode.Uri.joinPath(
    context.extensionUri,
    'media',
    'style.css',
  )

  // Uri to load styles into webview
  const stylesMainUri = webview.asWebviewUri(stylesPathMainPath)

  // Use a nonce to only allow specific scripts to be run
  const nonce = getNonce()

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <!--
    Use a content security policy to only allow loading images from https or from our extension directory,
    and only allow scripts that have a specific nonce.
  -->
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}';">
  <link href="${stylesMainUri}" rel="stylesheet" type="text/css">
  <title>Rails Routes Navigator</title>
</head>
<body>
  <h1>Rails Routes Search</h1>
  <div id="inputPanel">
    <button id="refreshButton" type="button">
      Refresh
    </button>
    <div>
      <input type="text" id="search" placeholder="Search.." />
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <td>Verb</td>
        <td>URI Pattern</td>
        <td>Controller#Action</td>
        <td>Prefix</td>
      </tr>
    </thead>
    <tbody id="allRoutes"></tbody>
  </table>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`
}

function getNonce() {
  let text = ''
  const possible =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length))
  }
  return text
}
