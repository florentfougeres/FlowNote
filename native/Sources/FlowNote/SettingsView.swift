import SwiftUI

/// FlowNote ▸ Réglages… (⌘,): the native Settings window.
struct SettingsView: View {
  var body: some View {
    TabView {
      GeneralSettings().tabItem { Label("Général", systemImage: "gearshape") }
      AppearanceSettings().tabItem { Label("Apparence", systemImage: "paintbrush") }
    }
    .frame(width: 480)
  }
}

private struct GeneralSettings: View {
  @Environment(AppModel.self) private var app

  var body: some View {
    @Bindable var app = app
    Form {
      Section("Vault") {
        LabeledContent("Dossier") {
          VStack(alignment: .trailing, spacing: 4) {
            Text(app.vault?.root.path(percentEncoded: false) ?? "Aucun")
              .lineLimit(2)
              .truncationMode(.middle)
              .textSelection(.enabled)
            if app.vault?.inICloud == true {
              Label("Dans iCloud Drive", systemImage: "icloud").font(.caption).foregroundStyle(.secondary)
            }
          }
        }
        HStack {
          Spacer()
          Button("Choisir dans iCloud Drive…") { app.chooseVault(inICloud: true) }
          Button("Changer…") { app.chooseVault() }
        }
      }
      Section("Édition") {
        Toggle("Enregistrement automatique", isOn: $app.autosave)
        Toggle("Afficher les titres des pages plutôt que les noms de fichier", isOn: $app.showTitles)
        TextField("Dossier des tickets", text: $app.ticketsFolder)
        TextField("Note des lectures", text: $app.readingList)
        Toggle("Lire le titre des liens ajoutés", isOn: $app.fetchTitles)
        Picker("Correcteur", selection: $app.spellChecker) {
          Text("Grammalecte (grammaire et orthographe)").tag("grammalecte")
          Text("Orthographe de macOS").tag("system")
          Text("Aucun").tag("off")
        }
      }
    }
    .formStyle(.grouped)
  }
}

private struct AppearanceSettings: View {
  @Environment(AppModel.self) private var app

  var body: some View {
    @Bindable var app = app
    Form {
      Picker("Thème", selection: $app.theme) {
        Text("Système").tag("system")
        Text("Clair").tag("light")
        Text("Sombre").tag("dark")
      }
      .pickerStyle(.segmented)
      // The sizes of the web app (UI_SCALES in SettingsPage.tsx).
      Picker("Taille des pages", selection: $app.uiScale) {
        Text("Petite").tag(0.9)
        Text("Normale").tag(1.0)
        Text("Grande").tag(1.1)
        Text("Très grande").tag(1.25)
      }
    }
    .formStyle(.grouped)
  }
}
