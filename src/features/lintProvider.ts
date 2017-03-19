"use strict";

import * as vscode from "vscode";
import * as path from "path";
import * as cp from "child_process";

import { BSL_MODE } from "../const";

export default class LintProvider {

    private commandId: string = this.getCommandId();
    private args: string[] = ["-encoding=utf-8", "-check"];
    private diagnosticCollection: vscode.DiagnosticCollection =
        vscode.languages.createDiagnosticCollection("OneScript Linter");
    private statusBarItem: vscode.StatusBarItem =
        vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);

    public activate(subscriptions: vscode.Disposable[]) {
        vscode.workspace.onDidOpenTextDocument(this.doBsllint, this, subscriptions);
        vscode.workspace.onDidCloseTextDocument(
            (textDocument) => {
                this.diagnosticCollection.delete(textDocument.uri);
            },
            undefined,
            subscriptions);
        vscode.workspace.onDidSaveTextDocument(this.doBsllint, this);
        vscode.workspace.textDocuments.forEach(this.doBsllint, this);
    }

    public dispose(): void {
        this.diagnosticCollection.clear();
        this.diagnosticCollection.dispose();
        this.statusBarItem.hide();
    }

    public doBsllint(textDocument: vscode.TextDocument) {
        if (!vscode.languages.match(BSL_MODE, textDocument)) {
            return;
        }
        let configuration = vscode.workspace.getConfiguration("language-1c-bsl");
        let linterEnabled = Boolean(configuration.get("enableOneScriptLinter"));
        let otherExtensions = String(configuration.get("lintOtherExtensions"));
        let linterEntryPoint = String(configuration.get("linterEntryPoint"));
        if (!linterEnabled) {
            return;
        }
        let filename = textDocument.uri.fsPath;
        let arrFilename = filename.split(".");
        if (arrFilename.length === 0) {
            return;
        }
        let extension = arrFilename[arrFilename.length - 1];
        if (extension !== "os" && !otherExtensions.includes(extension)) {
            return;
        }
        let args = this.args.slice();
        args.push(filename);
        if (linterEntryPoint) {
            args.push("-env=" + path.join(vscode.workspace.rootPath, linterEntryPoint));
        }
        let options = {
            cwd: path.dirname(filename),
            env: process.env
        };
        let result = "";
        let phpcs = cp.spawn(this.commandId, args, options);
        phpcs.stderr.on("data", function (buffer) {
            result += buffer.toString();
        });
        phpcs.stdout.on("data", function (buffer) {
            result += buffer.toString();
        });
        phpcs.on("close", () => {
            try {
                result = result.trim();
                let lines = result.split(/\r?\n/);
                let regex = /^\{Модуль\s+(.*)\s\/\s.*:\s+(\d+)\s+\/\s+(.*)\}/;
                let vscodeDiagnosticArray = new Array<vscode.Diagnostic>();
                for (let line in lines) {
                    let match = undefined;
                    match = lines[line].match(regex);
                    if (match) {
                        let range = new vscode.Range(
                                new vscode.Position(+match[2] - 1, 0),
                                new vscode.Position(+match[2] - 1, vscode.window.activeTextEditor.document.lineAt(+match[2] - 1).text.length)
                                );
                        let vscodeDiagnostic = new vscode.Diagnostic(range, match[3], vscode.DiagnosticSeverity.Error);
                        vscodeDiagnosticArray.push(vscodeDiagnostic);
                    }
                }
                this.diagnosticCollection.set(textDocument.uri, vscodeDiagnosticArray);
                if (vscodeDiagnosticArray.length !== 0 && !vscode.workspace.rootPath) {
                    this.statusBarItem.text = vscodeDiagnosticArray.length === 0 ? "$(check) No Error" : "$(alert) " + vscodeDiagnosticArray.length + " Errors";
                    this.statusBarItem.show();
                } else {
                    this.statusBarItem.hide();
                }
            } catch (e) {
                console.error(e);
            }
        });

    };

    public async getDiagnosticData(uri: vscode.Uri) {
        while (this.diagnosticCollection.get(uri) === undefined) {
            await this.delay(100);
        }
        return this.diagnosticCollection.get(uri);
    }

    private delay(milliseconds: number) {
        return new Promise<void>((resolve) => {
            setTimeout(resolve, milliseconds);
        });
    }

    private getCommandId(): string {
        let command = "";
        let commandConfig = vscode.workspace.getConfiguration("language-1c-bsl").get("onescriptPath");
        if (!commandConfig || String(commandConfig).length === 0) {
            command = "oscript";
        } else {
            command = String(commandConfig);
        }
        return command;
    };

}

