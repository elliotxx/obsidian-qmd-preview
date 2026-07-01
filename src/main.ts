import {
  App,
  ItemView,
  MarkdownRenderer,
  MarkdownView,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  WorkspaceLeaf,
  normalizePath,
} from "obsidian";
import { EditorView, ViewUpdate } from "@codemirror/view";
import { execFile } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";
import {
  extractQuartoCssRefs,
  extractYamlFrontmatter,
  isLikelyQmdPath,
  scopeCssToSelector,
  stableHash,
  transformQmdToObsidianMarkdown,
} from "./qmd";

const VIEW_TYPE_QMD_PREVIEW = "qmd-preview-view";
const DEFAULT_DEBOUNCE_MS = 200;
const DEFAULT_LARGE_FILE_THRESHOLD_BYTES = 200 * 1024;
const DEFAULT_QUARTO_PATH = "quarto";
const LIVE_PREVIEW_CSS_SCOPE = ".qmd-preview-render-buffer";
const QUARTO_INSTALL_URL = "https://quarto.org/docs/get-started/";
const QUARTO_CANDIDATE_PATHS = [
  "/usr/local/bin/quarto",
  "/opt/homebrew/bin/quarto",
  "/Applications/quarto/bin/quarto",
];

type PreviewStatus =
  | "idle"
  | "live-rendering"
  | "live-ready"
  | "quarto-rendering"
  | "quarto-ready"
  | "error";

interface QmdPreviewSettings {
  openLivePreviewByDefault: boolean;
  debounceMs: number;
  largeFileThresholdBytes: number;
  quartoPath: string;
  quartoOutputDir: string;
  autoRenderQuartoOnSave: boolean;
  trustedQuartoRender: boolean;
}

const DEFAULT_SETTINGS: QmdPreviewSettings = {
  openLivePreviewByDefault: true,
  debounceMs: DEFAULT_DEBOUNCE_MS,
  largeFileThresholdBytes: DEFAULT_LARGE_FILE_THRESHOLD_BYTES,
  quartoPath: "quarto",
  quartoOutputDir: "",
  autoRenderQuartoOnSave: false,
  trustedQuartoRender: false,
};

interface FileSystemAdapterWithBasePath {
  basePath?: string;
}

interface ElectronShell {
  openPath(filePath: string): Promise<string>;
}

export default class QmdPreviewPlugin extends Plugin {
  settings: QmdPreviewSettings = { ...DEFAULT_SETTINGS };
  previewViews = new Set<QmdPreviewView>();
  lastQmdFilePath: string | null = null;

  async onload() {
    await this.loadSettings();

    this.registerExtensions(["qmd"], "markdown");
    this.registerView(
      VIEW_TYPE_QMD_PREVIEW,
      (leaf) => new QmdPreviewView(leaf, this),
    );

    this.addRibbonIcon("file-text", "打开 QMD 预览", () => {
      void this.activatePreviewView();
    });

    this.addCommand({
      id: "open-preview",
      name: "打开预览",
      callback: () => {
        void this.activatePreviewView();
      },
    });

    this.addCommand({
      id: "refresh-preview",
      name: "刷新实时预览",
      callback: () => {
        for (const view of this.previewViews) view.scheduleLiveRender({ immediate: true, force: true });
      },
    });

    this.addCommand({
      id: "render-qmd-with-quarto",
      name: "使用 Quarto 渲染当前文件",
      callback: () => {
        for (const view of this.previewViews) void view.renderWithQuarto();
      },
    });

    this.registerEditorExtension(
      EditorView.updateListener.of((update: ViewUpdate) => {
        if (!update.docChanged) return;
        const active = this.getActiveQmdContext();
        if (!active) return;
        for (const view of this.previewViews) view.scheduleLiveRender();
      }),
    );

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        for (const view of this.previewViews) view.scheduleLiveRender({ immediate: true });
      }),
    );

    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        for (const view of this.previewViews) view.scheduleLiveRender({ immediate: true });
      }),
    );

    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile && isLikelyQmdPath(file.path) && this.settings.autoRenderQuartoOnSave) {
          for (const view of this.previewViews) void view.renderWithQuarto();
        }
        if (file instanceof TFile && isLiveStyleDependency(file.path)) {
          for (const view of this.previewViews) view.scheduleLiveRender({ immediate: true, force: true });
        }
      }),
    );

    this.addSettingTab(new QmdPreviewSettingTab(this.app, this));
  }

  onunload() {
    this.previewViews.clear();
  }

  async loadSettings() {
    const loaded = await this.loadData() as Partial<QmdPreviewSettings> | null;
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...(loaded ?? {}),
    };
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async activatePreviewView() {
    this.rememberActiveQmdContext();
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_QMD_PREVIEW).first();
    const leaf = existing ?? this.app.workspace.getRightLeaf(false);
    if (!leaf) {
      new Notice("QMD 预览：无法打开侧边栏。");
      return;
    }

    await leaf.setViewState({ type: VIEW_TYPE_QMD_PREVIEW, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  rememberActiveQmdContext(): { file: TFile; markdownView: MarkdownView } | null {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    const file = activeView?.file;
    if (!activeView || !file || !isLikelyQmdPath(file.path)) return null;
    this.lastQmdFilePath = file.path;
    return { file, markdownView: activeView };
  }

  getActiveQmdContext(): { file: TFile; markdownView: MarkdownView } | null {
    return this.rememberActiveQmdContext();
  }

  getRememberedQmdContext(): { file: TFile; markdownView?: MarkdownView } | null {
    const active = this.rememberActiveQmdContext();
    if (active) return active;
    if (!this.lastQmdFilePath) return null;

    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (view instanceof MarkdownView && view.file?.path === this.lastQmdFilePath) {
        return { file: view.file, markdownView: view };
      }
    }

    const file = this.app.vault.getFileByPath(this.lastQmdFilePath);
    if (!file || !isLikelyQmdPath(file.path)) return null;
    return { file };
  }

  async readActiveQmdContent(): Promise<{ file: TFile; content: string } | null> {
    const active = this.getRememberedQmdContext();
    if (!active) return null;
    if (active.markdownView) {
      return {
        file: active.file,
        content: active.markdownView.editor.getValue(),
      };
    }
    return {
      file: active.file,
      content: await this.app.vault.read(active.file),
    };
  }
}

class QmdPreviewView extends ItemView {
  plugin: QmdPreviewPlugin;
  timer: number | null = null;
  renderToken = 0;
  lastLiveHash = "";
  liveStyleSheet: CSSStyleSheet | null = null;
  liveStyleDocument: Document | null = null;
  status: PreviewStatus = "idle";
  mode: "live" | "quarto" = "live";
  lastSuccessfulHtml = "";
  lastPreviewHtml = "";
  htmlBlobUrl = "";
  lightboxIndex = 0;
  lastLightboxFocus: HTMLElement | null = null;

  toolbarEl: HTMLElement;
  liveButtonEl: HTMLButtonElement;
  quartoButtonEl: HTMLButtonElement;
  openHtmlButtonEl: HTMLButtonElement;
  statusEl: HTMLElement;
  bodyEl: HTMLElement;
  warningsEl: HTMLElement;
  lightboxEl: HTMLElement;
  lightboxImageEl: HTMLImageElement;
  lightboxCaptionEl: HTMLElement;
  lightboxCounterEl: HTMLElement;
  lightboxCloseButtonEl: HTMLButtonElement;

  constructor(leaf: WorkspaceLeaf, plugin: QmdPreviewPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return VIEW_TYPE_QMD_PREVIEW;
  }

  getDisplayText() {
    return "QMD 预览";
  }

  async onOpen() {
    this.plugin.previewViews.add(this);
    this.renderShell();
    this.scheduleLiveRender({ immediate: true });
  }

  async onClose() {
    this.plugin.previewViews.delete(this);
    if (this.timer) window.clearTimeout(this.timer);
    this.closeLightbox();
    this.removeLiveStyleSheet();
    this.revokeHtmlBlobUrl();
  }

  renderShell() {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("qmd-preview");

    this.toolbarEl = container.createDiv("qmd-preview-toolbar");
    this.warningsEl = container.createDiv("qmd-preview-warnings");
    this.bodyEl = container.createDiv("qmd-preview-body");

    this.renderToolbar();
    this.renderLightbox(container);
    this.registerDomEvent(this.bodyEl, "click", (event) => this.handlePreviewImageClick(event));
    this.registerDomEvent(this.bodyEl, "keydown", (event) => this.handlePreviewImageKeydown(event));
    this.registerDomEvent(window, "keydown", (event) => this.handleLightboxWindowKeydown(event));
    this.setStatus("idle", "打开一个 .qmd 文件后开始预览。");
  }

  renderToolbar() {
    this.toolbarEl.empty();
    this.toolbarEl.createEl("span", {
      cls: "qmd-preview-title",
      text: "QMD 预览",
    });
    this.statusEl = this.toolbarEl.createDiv("qmd-preview-status");

    const modeGroup = this.toolbarEl.createDiv("qmd-preview-mode-group");
    this.liveButtonEl = modeGroup.createEl("button", {
      text: "实时预览",
      cls: "qmd-preview-button qmd-preview-mode-button",
    });
    this.liveButtonEl.addEventListener("click", () => {
      this.switchToLivePreview();
    });

    this.quartoButtonEl = modeGroup.createEl("button", {
      text: "Quarto 渲染",
      cls: "qmd-preview-button qmd-preview-mode-button",
    });
    this.quartoButtonEl.addEventListener("click", () => {
      void this.renderWithQuarto();
    });

    this.openHtmlButtonEl = this.toolbarEl.createEl("button", {
      text: "浏览器打开",
      cls: "qmd-preview-button qmd-preview-open-html-button",
      attr: {
        "aria-disabled": "true",
        "data-tooltip": "实时预览不会生成浏览器 HTML。请先点击“Quarto 渲染”，生成 Quarto HTML 后再打开。",
      },
    });
    this.openHtmlButtonEl.addEventListener("click", () => {
      void this.openQuartoHtmlInBrowser();
    });

    const refreshButton = this.toolbarEl.createEl("button", {
      text: "刷新",
      cls: "qmd-preview-button",
    });
    refreshButton.addEventListener("click", () => {
      this.scheduleLiveRender({ immediate: true, force: true });
    });
    this.updateModeButtons();
  }

  scheduleLiveRender(options: { immediate?: boolean; force?: boolean } = {}) {
    if (this.timer) window.clearTimeout(this.timer);
    const delay = options.immediate ? 0 : this.plugin.settings.debounceMs;
    this.timer = window.setTimeout(() => {
      void this.renderLive(options.force ?? false);
    }, delay);
  }

  async renderLive(force = false) {
    const token = ++this.renderToken;
    const active = await this.plugin.readActiveQmdContent();
    if (!active) {
      this.lastLiveHash = "";
      this.setStatus("idle", "当前没有打开 QMD 文件。");
      this.removeLiveStyleSheet();
      this.revokeHtmlBlobUrl();
      this.lastSuccessfulHtml = "";
      this.lastPreviewHtml = "";
      this.updateOpenHtmlButton();
      this.bodyEl.empty();
      this.bodyEl.createEl("div", {
        cls: "qmd-preview-empty",
        text: "打开一个 .qmd 文件后，这里会显示实时预览。",
      });
      return;
    }

    const size = new TextEncoder().encode(active.content).length;
    if (!force && size > this.plugin.settings.largeFileThresholdBytes) {
      this.setStatus("idle", `文件较大（${formatBytes(size)}），已暂停输入时实时渲染。点击“刷新”手动预览。`);
      return;
    }

    const liveStyles = await loadLivePreviewStyles(this.app, active.file, active.content);
    const sourceHash = stableHash(`${active.file.path}\n${active.content}\n${liveStyles.css}`);
    if (!force && sourceHash === this.lastLiveHash) return;

    this.setStatus("live-rendering", `正在实时预览：${active.file.path}`);
    const result = transformQmdToObsidianMarkdown(active.content);
    const next = createDiv("qmd-preview-render-buffer");

    try {
      await MarkdownRenderer.render(this.app, result.markdown, next, active.file.path, this);
      if (token !== this.renderToken) return;
      this.replaceLiveStyleSheet(liveStyles.css);
      this.lastLiveHash = sourceHash;
      this.mode = "live";
      this.updateModeButtons();
      this.revokeHtmlBlobUrl();
      this.closeLightbox();
      this.bodyEl.empty();
      this.bodyEl.appendChild(next);
      this.prepareLivePreviewImages(next);
      this.renderWarnings([...result.warnings, ...liveStyles.warnings]);
      const styleText = liveStyles.sources.length > 0 ? `已应用 ${liveStyles.sources.length} 个样式文件；` : "";
      this.setStatus("live-ready", `${styleText}实时预览不执行代码，最终效果以 Quarto 渲染为准。`);
    } catch (error) {
      if (token !== this.renderToken) return;
      this.setStatus("error", `实时预览失败：${getErrorMessage(error)}`);
    }
  }

  async renderWithQuarto() {
    const active = await this.plugin.readActiveQmdContent();
    if (!active) {
      new Notice("QMD 预览：当前没有打开 QMD 文件。");
      return;
    }

    const token = ++this.renderToken;
    const quartoCommand = resolveQuartoCommand(this.plugin.settings.quartoPath);
    this.setStatus("quarto-rendering", "正在检查 Quarto CLI。");
    const quartoCheck = await checkQuartoCommand(quartoCommand);
    if (!quartoCheck.available) {
      if (token !== this.renderToken) return;
      this.setStatus("error", "未找到 Quarto CLI。实时预览仍可使用；如需官方 HTML 输出，请安装 Quarto 或在设置中填写 Quarto CLI 路径。");
      new QuartoMissingModal(this.app, quartoCommand, quartoCheck.message).open();
      return;
    }

    if (!this.plugin.settings.trustedQuartoRender) {
      const confirmed = await new Promise<boolean>((resolve) => {
        new QuartoTrustModal(this.app, async () => {
          this.plugin.settings.trustedQuartoRender = true;
          await this.plugin.saveSettings();
          resolve(true);
        }, () => resolve(false)).open();
      });
      if (!confirmed) return;
    }

    this.setStatus("quarto-rendering", `正在使用 Quarto 渲染：${active.file.path}`);

    try {
      const htmlPath = await renderQuartoHtml(this.app, this.plugin.settings, active.file);
      if (token !== this.renderToken) return;
      await this.showHtmlPreview(htmlPath);
      this.mode = "quarto";
      this.updateModeButtons();
      this.setStatus("quarto-ready", `Quarto 预览已生成：${htmlPath}`);
    } catch (error) {
      if (token !== this.renderToken) return;
      this.setStatus("error", `Quarto 渲染失败：${getErrorMessage(error)}`);
      if (this.lastSuccessfulHtml) await this.showHtmlPreview(this.lastSuccessfulHtml);
    }
  }

  async showHtmlPreview(htmlPath: string) {
    this.lastSuccessfulHtml = htmlPath;
    const rawHtml = await fs.readFile(htmlPath, "utf8");
    const htmlDir = path.dirname(htmlPath);
    const inlinedHtml = await inlineLocalStylesheets(rawHtml, htmlDir);
    const iframeHtml = injectBaseHref(injectEmbeddedPreviewStyles(inlinedHtml, "iframe"), htmlDir);
    const browserHtml = injectBaseHref(injectEmbeddedPreviewStyles(inlinedHtml, "browser"), htmlDir);
    this.lastPreviewHtml = await writePreviewHtml(htmlPath, browserHtml);
    this.warningsEl.empty();
    this.revokeHtmlBlobUrl();
    this.removeLiveStyleSheet();
    this.closeLightbox();
    this.bodyEl.empty();
    this.htmlBlobUrl = URL.createObjectURL(new Blob([iframeHtml], { type: "text/html" }));
    this.updateOpenHtmlButton();
    const iframe = this.bodyEl.createEl("iframe", {
      cls: "qmd-preview-iframe",
      attr: {
        sandbox: "allow-scripts allow-same-origin",
      },
    });
    iframe.setAttr("title", "Quarto HTML 预览");
    iframe.src = this.htmlBlobUrl;

    iframe.addEventListener("load", () => {
      window.setTimeout(() => {
        const doc = iframe.contentDocument;
        const hasBody = Boolean(doc?.body);
        const hasContent = Boolean(doc?.body?.innerText.trim() || doc?.body?.children.length);
        if (hasBody && !hasContent) {
          this.setStatus("error", "Quarto HTML 已生成，但预览页为空。请尝试在浏览器中打开生成的 HTML。");
        }
      }, 300);
    });
  }

  revokeHtmlBlobUrl() {
    if (!this.htmlBlobUrl) return;
    URL.revokeObjectURL(this.htmlBlobUrl);
    this.htmlBlobUrl = "";
  }

  async openQuartoHtmlInBrowser() {
    if (!this.lastPreviewHtml) {
      return;
    }
    try {
      const error = await openLocalFile(this.lastPreviewHtml);
      if (error) {
        new Notice(`QMD 预览：无法在浏览器中打开 HTML：${error}`);
      }
    } catch (error) {
      new Notice(`QMD 预览：无法在浏览器中打开 HTML：${getErrorMessage(error)}`);
    }
  }

  replaceLiveStyleSheet(css: string) {
    this.removeLiveStyleSheet();
    if (!css) return;
    const doc = this.containerEl.win.activeDocument;
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
    this.liveStyleDocument = doc;
    this.liveStyleSheet = sheet;
  }

  removeLiveStyleSheet() {
    if (!this.liveStyleDocument || !this.liveStyleSheet) return;
    this.liveStyleDocument.adoptedStyleSheets = this.liveStyleDocument.adoptedStyleSheets.filter(
      (sheet) => sheet !== this.liveStyleSheet,
    );
    this.liveStyleDocument = null;
    this.liveStyleSheet = null;
  }

  switchToLivePreview() {
    this.mode = "live";
    this.updateModeButtons();
    this.scheduleLiveRender({ immediate: true, force: true });
  }

  updateModeButtons() {
    if (!this.liveButtonEl || !this.quartoButtonEl) return;
    this.liveButtonEl.toggleClass("is-active", this.mode === "live");
    this.quartoButtonEl.toggleClass("is-active", this.mode === "quarto");
    this.liveButtonEl.setAttr("aria-pressed", String(this.mode === "live"));
    this.quartoButtonEl.setAttr("aria-pressed", String(this.mode === "quarto"));
    this.updateOpenHtmlButton();
  }

  updateOpenHtmlButton() {
    if (!this.openHtmlButtonEl) return;
    const enabled = Boolean(this.lastPreviewHtml);
    this.openHtmlButtonEl.toggleClass("is-disabled", !enabled);
    this.openHtmlButtonEl.setAttr("aria-disabled", String(!enabled));
    this.openHtmlButtonEl.setAttr(
      "data-tooltip",
      enabled
        ? "在浏览器中打开当前 Quarto 预览 HTML。"
        : "实时预览不会生成浏览器 HTML。请先点击“Quarto 渲染”，生成 Quarto HTML 后再打开。",
    );
  }

  setStatus(status: PreviewStatus, text: string) {
    this.status = status;
    this.statusEl.empty();
    this.statusEl.setAttr("data-status-text", text);
    this.statusEl.setAttr("tabindex", "0");
    this.statusEl.createSpan({
      cls: `qmd-preview-status-dot qmd-preview-status-${status}`,
      text: " ",
    });
  }

  renderWarnings(warnings: string[]) {
    this.warningsEl.empty();
    if (warnings.length === 0) return;
    const list = this.warningsEl.createEl("ul");
    for (const warning of warnings) {
      list.createEl("li", { text: warning });
    }
  }

  renderLightbox(container: HTMLElement) {
    this.lightboxEl = container.createDiv({
      cls: "qmd-preview-lightbox",
      attr: {
        "aria-hidden": "true",
        "aria-label": "图片预览",
        "aria-modal": "true",
        role: "dialog",
      },
    });

    const backdrop = this.lightboxEl.createEl("button", {
      cls: "qmd-preview-lightbox-backdrop",
      attr: { "aria-label": "关闭预览", type: "button" },
    });
    backdrop.addEventListener("click", () => this.closeLightbox());

    const panel = this.lightboxEl.createDiv("qmd-preview-lightbox-panel");
    panel.addEventListener("click", (event) => {
      if (event.target === panel) this.closeLightbox();
    });

    this.lightboxCloseButtonEl = panel.createEl("button", {
      cls: "qmd-preview-lightbox-close",
      text: "×",
      attr: { "aria-label": "关闭预览", type: "button" },
    });
    this.lightboxCloseButtonEl.addEventListener("click", () => this.closeLightbox());

    const previousButton = panel.createEl("button", {
      cls: "qmd-preview-lightbox-nav qmd-preview-lightbox-prev",
      text: "‹",
      attr: { "aria-label": "上一张", type: "button" },
    });
    previousButton.addEventListener("click", () => this.moveLightbox(-1));

    this.lightboxImageEl = panel.createEl("img", {
      cls: "qmd-preview-lightbox-image",
      attr: { alt: "" },
    });

    const nextButton = panel.createEl("button", {
      cls: "qmd-preview-lightbox-nav qmd-preview-lightbox-next",
      text: "›",
      attr: { "aria-label": "下一张", type: "button" },
    });
    nextButton.addEventListener("click", () => this.moveLightbox(1));

    this.lightboxCaptionEl = panel.createDiv("qmd-preview-lightbox-caption");
    this.lightboxCounterEl = panel.createDiv("qmd-preview-lightbox-counter");
  }

  prepareLivePreviewImages(root: HTMLElement) {
    const images = Array.from(root.querySelectorAll("img"));
    for (const image of images) {
      image.tabIndex = 0;
      image.setAttr("role", "button");
      image.setAttr("aria-label", `${getImageCaption(image) || "图片"}，点击放大预览`);
      image.addClass("qmd-preview-lightbox-trigger");
    }
  }

  handlePreviewImageClick(event: MouseEvent) {
    const image = this.findPreviewImageFromEvent(event);
    if (!image) return;
    event.preventDefault();
    this.openLightbox(image);
  }

  handlePreviewImageKeydown(event: KeyboardEvent) {
    if (event.key !== "Enter" && event.key !== " ") return;
    const image = this.findPreviewImageFromEvent(event);
    if (!image) return;
    event.preventDefault();
    this.openLightbox(image);
  }

  handleLightboxWindowKeydown(event: KeyboardEvent) {
    if (!this.isLightboxOpen()) return;
    if (event.key === "Escape") {
      event.preventDefault();
      this.closeLightbox();
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      this.moveLightbox(-1);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      this.moveLightbox(1);
    }
  }

  findPreviewImageFromEvent(event: Event): HTMLImageElement | null {
    const target = event.target;
    if (!(target instanceof Element)) return null;
    const image = target.closest("img");
    if (!image?.instanceOf(HTMLImageElement)) return null;
    if (!image.closest(".qmd-preview-render-buffer")) return null;
    if (!image.currentSrc && !image.src) return null;
    return image;
  }

  openLightbox(image: HTMLImageElement) {
    const images = this.getLightboxImages();
    const index = images.indexOf(image);
    if (index === -1) return;
    this.lightboxIndex = index;
    const activeElement = this.containerEl.win.activeDocument.activeElement;
    this.lastLightboxFocus = activeElement?.instanceOf(HTMLElement) ? activeElement : null;
    this.renderLightboxImage();
    this.lightboxEl.addClass("is-open");
    this.lightboxEl.setAttr("aria-hidden", "false");
    this.lightboxCloseButtonEl.focus();
  }

  closeLightbox() {
    if (!this.lightboxEl || !this.isLightboxOpen()) return;
    this.lightboxEl.removeClass("is-open");
    this.lightboxEl.setAttr("aria-hidden", "true");
    this.lightboxImageEl.removeAttribute("src");
    this.lightboxImageEl.setAttr("alt", "");
    this.lightboxCaptionEl.setText("");
    this.lightboxCounterEl.setText("");
    this.lastLightboxFocus?.focus();
    this.lastLightboxFocus = null;
  }

  moveLightbox(step: number) {
    const images = this.getLightboxImages();
    if (images.length === 0) return;
    this.lightboxIndex = (this.lightboxIndex + step + images.length) % images.length;
    this.renderLightboxImage();
  }

  renderLightboxImage() {
    const images = this.getLightboxImages();
    const image = images[this.lightboxIndex];
    if (!image) return;
    const caption = getImageCaption(image);
    this.lightboxImageEl.src = image.currentSrc || image.src;
    this.lightboxImageEl.alt = image.alt || "图片预览";
    this.lightboxCaptionEl.setText(caption);
    this.lightboxCounterEl.setText(`${this.lightboxIndex + 1} / ${images.length}`);
  }

  getLightboxImages(): HTMLImageElement[] {
    return Array.from(this.bodyEl.querySelectorAll(".qmd-preview-render-buffer img")).filter(
      (image): image is HTMLImageElement => image.instanceOf(HTMLImageElement) && Boolean(image.currentSrc || image.src),
    );
  }

  isLightboxOpen(): boolean {
    return Boolean(this.lightboxEl?.hasClass("is-open"));
  }
}

function getImageCaption(image: HTMLImageElement): string {
  const figureCaption = image.closest("figure")?.querySelector("figcaption")?.textContent?.trim();
  if (figureCaption) return figureCaption;
  return image.alt.trim();
}

interface LivePreviewStyles {
  css: string;
  sources: string[];
  warnings: string[];
}

interface CssRefWithBase {
  path: string;
  baseDir: string;
  source: string;
}

async function loadLivePreviewStyles(app: App, file: TFile, source: string): Promise<LivePreviewStyles> {
  const warnings: string[] = [];
  const refs = await collectQuartoCssRefs(app, file, source, warnings);
  const cssBlocks: string[] = [];
  const sources: string[] = [];
  const seen = new Set<string>();

  for (const ref of refs) {
    if (isExternalStyleRef(ref.path)) {
      warnings.push(`实时预览暂不加载远程样式：${ref.path}`);
      continue;
    }

    const cssPath = resolveVaultCssPath(ref.baseDir, ref.path);
    if (seen.has(cssPath)) continue;
    seen.add(cssPath);

    const cssFile = app.vault.getFileByPath(cssPath);
    if (!cssFile) {
      warnings.push(`${ref.source} 指向的样式文件不存在：${cssPath}`);
      continue;
    }

    try {
      const rawCss = await app.vault.read(cssFile);
      const scopedCss = scopeCssToSelector(rawCss, LIVE_PREVIEW_CSS_SCOPE);
      if (!scopedCss) continue;
      cssBlocks.push(`/* ${cssPath} */\n${scopedCss}`);
      sources.push(cssPath);
    } catch (error) {
      warnings.push(`读取样式文件失败：${cssPath}，${getErrorMessage(error)}`);
    }
  }

  return {
    css: cssBlocks.join("\n\n"),
    sources,
    warnings,
  };
}

async function collectQuartoCssRefs(
  app: App,
  file: TFile,
  source: string,
  warnings: string[],
): Promise<CssRefWithBase[]> {
  const refs: CssRefWithBase[] = [];
  const currentDir = vaultDirname(file.path);

  for (const dir of vaultDirsFromRoot(currentDir)) {
    for (const name of ["_metadata.yml", "_metadata.yaml"]) {
      const metadataPath = joinVaultPath(dir, name);
      const metadataFile = app.vault.getFileByPath(metadataPath);
      if (!metadataFile) continue;
      try {
        const config: unknown = parseYaml(await app.vault.read(metadataFile));
        for (const ref of extractQuartoCssRefs(config)) {
          refs.push({ path: ref.path, baseDir: dir, source: metadataPath });
        }
      } catch (error) {
        warnings.push(`解析 Quarto 元数据失败：${metadataPath}，${getErrorMessage(error)}`);
      }
    }
  }

  const frontmatter = extractYamlFrontmatter(source);
  if (frontmatter) {
    try {
      const config: unknown = parseYaml(frontmatter);
      for (const ref of extractQuartoCssRefs(config)) {
        refs.push({ path: ref.path, baseDir: currentDir, source: file.path });
      }
    } catch (error) {
      warnings.push(`解析当前 QMD frontmatter 失败：${getErrorMessage(error)}`);
    }
  }

  return refs;
}

function isLiveStyleDependency(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return lower.endsWith(".css") || lower.endsWith("_metadata.yml") || lower.endsWith("_metadata.yaml");
}

function isExternalStyleRef(ref: string): boolean {
  return /^(https?:|data:|file:)/i.test(ref);
}

function resolveVaultCssPath(baseDir: string, ref: string): string {
  if (ref.startsWith("/")) return normalizePath(ref.slice(1));
  return joinVaultPath(baseDir, ref);
}

function joinVaultPath(baseDir: string, child: string): string {
  const pathValue = baseDir ? `${baseDir}/${child}` : child;
  return normalizePath(pathValue);
}

function vaultDirname(filePath: string): string {
  const dir = path.posix.dirname(filePath);
  return dir === "." ? "" : dir;
}

function vaultDirsFromRoot(dir: string): string[] {
  if (!dir) return [""];
  const dirs = [""];
  const parts = dir.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    dirs.push(current);
  }
  return dirs;
}

class QmdPreviewSettingTab extends PluginSettingTab {
  plugin: QmdPreviewPlugin;

  constructor(app: App, plugin: QmdPreviewPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setName("预览").setHeading();
    const resolvedQuarto = resolveQuartoCommand(this.plugin.settings.quartoPath);

    new Setting(containerEl)
      .setName("默认启用实时预览")
      .setDesc("打开 QMD 预览面板后，跟随当前 QMD 文件实时更新。")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.openLivePreviewByDefault)
          .onChange(async (value) => {
            this.plugin.settings.openLivePreviewByDefault = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("实时预览防抖时间")
      .setDesc("单位为毫秒。输入停止后超过该时间才刷新预览。")
      .addText((text) => {
        text
          .setPlaceholder(String(DEFAULT_DEBOUNCE_MS))
          .setValue(String(this.plugin.settings.debounceMs))
          .onChange(async (value) => {
            this.plugin.settings.debounceMs = clampNumber(Number(value), 50, 2000, DEFAULT_DEBOUNCE_MS);
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("大文件阈值")
      .setDesc("单位为字节。超过阈值后，输入时不自动实时渲染，需要手动刷新。")
      .addText((text) => {
        text
          .setPlaceholder(String(DEFAULT_LARGE_FILE_THRESHOLD_BYTES))
          .setValue(String(this.plugin.settings.largeFileThresholdBytes))
          .onChange(async (value) => {
            this.plugin.settings.largeFileThresholdBytes = clampNumber(
              Number(value),
              10 * 1024,
              10 * 1024 * 1024,
              DEFAULT_LARGE_FILE_THRESHOLD_BYTES,
            );
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Quarto CLI 路径")
      .setDesc(`默认自动探测 Quarto。当前解析为：${resolvedQuarto}`)
      .addText((text) => {
        text
          .setPlaceholder("quarto")
          .setValue(this.plugin.settings.quartoPath)
          .onChange(async (value) => {
            this.plugin.settings.quartoPath = value.trim() || "quarto";
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Quarto 输出目录")
      .setDesc("可选。留空时使用系统临时目录，避免污染 vault。")
      .addText((text) => {
        text
          .setPlaceholder("留空使用系统临时目录")
          .setValue(this.plugin.settings.quartoOutputDir)
          .onChange(async (value) => {
            this.plugin.settings.quartoOutputDir = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("保存后自动 Quarto 渲染")
      .setDesc("默认关闭。Quarto 渲染可能执行文档中的代码。")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.autoRenderQuartoOnSave)
          .onChange(async (value) => {
            this.plugin.settings.autoRenderQuartoOnSave = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("重置 Quarto 执行确认")
      .setDesc("下次使用 Quarto 渲染时重新提示代码执行风险。")
      .addButton((button) => {
        button
          .setButtonText("重置")
          .onClick(async () => {
            this.plugin.settings.trustedQuartoRender = false;
            await this.plugin.saveSettings();
            new Notice("QMD 预览：已重置 Quarto 执行确认。");
          });
      });
  }
}

class QuartoTrustModal extends Modal {
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;

  constructor(app: App, onConfirm: () => void | Promise<void>, onCancel: () => void) {
    super(app);
    this.onConfirm = onConfirm;
    this.onCancel = onCancel;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "确认执行 Quarto 渲染" });
    contentEl.createEl("p", {
      text: "Quarto 渲染可能执行当前文档中的 Python、R、Julia 或 shell 代码。请只渲染可信文档。",
    });

    const actions = contentEl.createDiv("qmd-preview-modal-actions");
    actions.createEl("button", { text: "取消" }).addEventListener("click", () => {
      this.onCancel();
      this.close();
    });
    actions.createEl("button", { text: "确认渲染", cls: "mod-cta" }).addEventListener("click", () => {
      void this.onConfirm();
      this.close();
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

class QuartoMissingModal extends Modal {
  command: string;
  detail: string;

  constructor(app: App, command: string, detail: string) {
    super(app);
    this.command = command;
    this.detail = detail;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "未找到 Quarto CLI" });
    contentEl.createEl("p", {
      text: "实时预览仍可使用。只有需要 Quarto 官方 HTML 输出时，才需要安装 Quarto CLI。",
    });
    contentEl.createEl("p", {
      text: `当前尝试执行：${this.command}`,
    });
    contentEl.createEl("p", {
      text: "安装完成后，如果 Obsidian 仍然找不到 Quarto，请在插件设置中填写 Quarto CLI 路径。",
    });
    contentEl.createEl("p", {
      text: `错误信息：${this.detail}`,
    });

    const actions = contentEl.createDiv("qmd-preview-modal-actions");
    actions.createEl("button", { text: "关闭" }).addEventListener("click", () => {
      this.close();
    });
    actions.createEl("button", { text: "打开安装页面", cls: "mod-cta" }).addEventListener("click", () => {
      window.open(QUARTO_INSTALL_URL);
      this.close();
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

async function renderQuartoHtml(app: App, settings: QmdPreviewSettings, file: TFile): Promise<string> {
  const inputPath = getVaultFileSystemPath(app, file);
  const quartoCommand = resolveQuartoCommand(settings.quartoPath);
  const outputDir = settings.quartoOutputDir
    ? path.resolve(settings.quartoOutputDir)
    : await fs.mkdtemp(path.join(os.tmpdir(), "obsidian-qmd-preview-"));

  await fs.mkdir(outputDir, { recursive: true });

  await execFileAsync(quartoCommand, [
    "render",
    inputPath,
    "--to",
    "html",
    "--output-dir",
    outputDir,
  ], path.dirname(inputPath));

  const parsed = path.parse(file.name);
  return path.join(outputDir, `${parsed.name}.html`);
}

function resolveQuartoCommand(configuredPath: string): string {
  const configured = configuredPath.trim();
  if (configured && configured !== DEFAULT_QUARTO_PATH) return configured;

  for (const candidate of QUARTO_CANDIDATE_PATHS) {
    if (fsSync.existsSync(candidate)) return candidate;
  }

  return DEFAULT_QUARTO_PATH;
}

async function checkQuartoCommand(command: string): Promise<{ available: boolean; message: string }> {
  try {
    await execFileAsync(command, ["--version"], process.cwd(), 10000);
    return { available: true, message: "" };
  } catch (error) {
    return { available: false, message: getErrorMessage(error) };
  }
}

function getVaultFileSystemPath(app: App, file: TFile): string {
  const adapter = app.vault.adapter;
  const basePath = (adapter as FileSystemAdapterWithBasePath).basePath;
  if (!basePath) {
    throw new Error("当前 vault adapter 不支持本地文件路径。");
  }
  return path.join(basePath, file.path);
}

function execFileAsync(command: string, args: string[], cwd: string, timeout = 120000): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd, timeout }, (error, stdout, stderr) => {
      if (error) {
        const message = [error.message, stdout, stderr].filter(Boolean).join("\n");
        reject(new Error(message));
        return;
      }
      resolve();
    });
  });
}

async function writePreviewHtml(sourceHtmlPath: string, html: string): Promise<string> {
  const extension = path.extname(sourceHtmlPath) || ".html";
  const basename = path.basename(sourceHtmlPath, extension);
  const previewPath = path.join(path.dirname(sourceHtmlPath), `${basename}.qmd-preview${extension}`);
  await fs.writeFile(previewPath, html, "utf8");
  return previewPath;
}

async function openLocalFile(filePath: string): Promise<string> {
  const shell = getElectronShell();
  if (!shell) {
    window.open(pathToFileURL(filePath).href);
    return "";
  }
  return shell.openPath(filePath);
}

function getElectronShell(): ElectronShell | null {
  try {
    const electron = require("electron") as { shell?: ElectronShell };
    return electron.shell ?? null;
  } catch {
    return null;
  }
}

function injectBaseHref(html: string, baseDir: string): string {
  const baseHref = pathToFileURL(`${baseDir}${path.sep}`).href;
  const baseTag = `<base href="${baseHref}">`;
  if (/<base\s/i.test(html)) return html;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>\n${baseTag}`);
  }
  return `${baseTag}\n${html}`;
}

function injectEmbeddedPreviewStyles(html: string, mode: "iframe" | "browser"): string {
  const layout = mode === "browser" ? `
#quarto-content {
  display: block !important;
  box-sizing: border-box !important;
  width: min(1040px, calc(100vw - 64px)) !important;
  max-width: 1040px !important;
  margin: 0 auto !important;
  padding: 24px 0 56px !important;
}
main.content,
.weekly-report {
  grid-column: auto !important;
  box-sizing: border-box !important;
  width: 100% !important;
  max-width: 1040px !important;
  margin-left: auto !important;
  margin-right: auto !important;
}
@media (max-width: 900px) {
  #quarto-content {
    width: calc(100vw - 32px) !important;
    padding: 16px 0 40px !important;
  }
}
` : `
#quarto-content {
  display: block !important;
  width: 100% !important;
  max-width: none !important;
  margin: 0 !important;
  padding: 0 28px 40px !important;
}
main.content,
.weekly-report {
  grid-column: auto !important;
  width: 100% !important;
  max-width: none !important;
  margin-top: 0 !important;
  margin-left: 0 !important;
  margin-right: 0 !important;
  padding-top: 0 !important;
}
@media (max-width: 900px) {
  #quarto-content {
    padding: 0 16px 32px !important;
  }
}
`;

  const style = `<style data-qmd-preview-embedded-fit>
html,
body {
  margin: 0 !important;
  padding: 0 !important;
  width: 100% !important;
}
body {
  overflow-x: hidden !important;
}
${layout}
#title-block-header,
.quarto-title-block {
  display: none !important;
  height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
}
#quarto-content > :first-child,
main.content > :first-child,
main.content > #title-block-header + *,
#quarto-document-content,
.weekly-report > :first-child {
  margin-top: 0 !important;
  padding-top: 0 !important;
}
</style>`;

  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${style}\n</head>`);
  }
  return `${style}\n${html}`;
}

async function inlineLocalStylesheets(html: string, baseDir: string): Promise<string> {
  const stylesheetLinkPattern = /<link\b(?=[^>]*\brel=(["'])stylesheet\1)(?=[^>]*\bhref=(["'])(.*?)\2)[^>]*>/gi;
  const replacements: Array<{ original: string; replacement: string }> = [];

  for (const match of html.matchAll(stylesheetLinkPattern)) {
    const original = match[0];
    const href = match[3] ?? "";
    if (!href || isExternalResourceHref(href)) continue;

    const cssPath = resolveLocalResourcePath(baseDir, href);
    try {
      const rawCss = await fs.readFile(cssPath, "utf8");
      const css = rewriteCssUrls(rawCss, path.dirname(cssPath));
      replacements.push({
        original,
        replacement: `<style data-qmd-preview-inlined-css="${escapeHtmlAttribute(href)}">\n${css}\n</style>`,
      });
    } catch {
      continue;
    }
  }

  let result = html;
  for (const replacement of replacements) {
    result = result.replace(replacement.original, replacement.replacement);
  }
  return result;
}

function rewriteCssUrls(css: string, cssDir: string): string {
  return css.replace(/url\(([^)]+)\)/gi, (match, rawValue: string) => {
    const trimmed = rawValue.trim();
    const quote = trimmed.startsWith('"') || trimmed.startsWith("'") ? trimmed[0] : "";
    const value = quote ? trimmed.slice(1, -1) : trimmed;
    if (!value || isExternalResourceHref(value) || value.startsWith("#")) return match;

    const absolutePath = resolveLocalResourcePath(cssDir, value);
    const fileUrl = pathToFileURL(absolutePath).href;
    return `url("${fileUrl}")`;
  });
}

function resolveLocalResourcePath(baseDir: string, href: string): string {
  const withoutFragment = href.split("#", 1)[0] ?? href;
  const withoutQuery = withoutFragment.split("?", 1)[0] ?? withoutFragment;
  const decoded = decodeURIComponent(withoutQuery);
  return path.resolve(baseDir, decoded);
}

function isExternalResourceHref(href: string): boolean {
  return /^(https?:|data:|file:|blob:|mailto:|#)/i.test(href);
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}
