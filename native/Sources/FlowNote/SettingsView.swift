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
    }
    .formStyle(.grouped)
  }
}
