// @description Inject custom CSS and JavaScript into every embedded WKWebView spawned by Discord Phoenix (Activities, Watch Together, embedded pages)
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Utility

const settings = phoenix.settings.define({
  css: {
    type: "text",
    title: "Custom WebView CSS",
    description: "CSS injected into all frames of embedded Discord Phoenix webviews",
    default: "",
  },
  js: {
    type: "text",
    title: "Custom WebView JS",
    description: "JavaScript injected at document_start into embedded Discord Phoenix webviews",
    default: "",
  },
});

let removeCss: (() => void) | null = null;
let removeJs: (() => void) | null = null;

function apply() {
  if (removeCss) {
    removeCss();
    removeCss = null;
  }
  if (removeJs) {
    removeJs();
    removeJs = null;
  }
  const css = (settings.css || "").trim();
  const js = (settings.js || "").trim();
  if (css && typeof phoenix.ui.addWebviewCss === "function") {
    removeCss = phoenix.ui.addWebviewCss("user", css);
  }
  if (js && typeof phoenix.ui.addWebviewScript === "function") {
    removeJs = phoenix.ui.addWebviewScript("user", js);
  }
}

apply();

phoenix.commands.register({
  name: "webviewcss",
  description: "Set or clear custom CSS injected into all Discord Phoenix webviews (/webviewcss <css|clear>)",
  execute(args) {
    const val = args.trim();
    if (!val || val === "clear") {
      if (removeCss) {
        removeCss();
        removeCss = null;
      }
      phoenix.ui.toast("Cleared custom WebView CSS");
      return;
    }
    if (typeof phoenix.ui.addWebviewCss !== "function") {
      phoenix.ui.toast("WebView CSS injection requires macOS Sunbird");
      return;
    }
    if (removeCss) removeCss();
    removeCss = phoenix.ui.addWebviewCss("user", val);
    phoenix.ui.toast("Applied custom WebView CSS to future webviews");
  },
});
