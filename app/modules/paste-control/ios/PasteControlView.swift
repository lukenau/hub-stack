// A system paste button.
//
// Reading the clipboard from code makes iOS ask "AGENT HUB would like to paste
// from Screenshots", every time (the user, 2026-09-30: "can you make it so i don't
// have to hit allow paste please"). No JavaScript can suppress that — it is the
// OS asking on the user's behalf. `UIPasteControl` is the way out Apple
// provides: the system draws the button and reads the pasteboard itself, so the
// tap IS the consent and no dialog appears.
//
// The control only delivers to a responder that declares what it accepts
// (`pasteConfiguration`) and implements `paste(itemProviders:)`. This view is
// that responder; it turns whatever arrives into JPEG bytes and hands them to
// JS, which uploads them the same way the picker's images go.
import ExpoModulesCore
import UIKit
import UniformTypeIdentifiers

/// Matches `attachments.ts`'s own ceiling for a picked image, so a paste cannot
/// take a path the upload would refuse.
private let kJpegQuality: CGFloat = 0.8

class PasteControlView: ExpoView {
  private let onPasteImage = EventDispatcher()
  private let onPasteError = EventDispatcher()
  private var control: UIView?

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    // What this responder is willing to receive. Without it the control stays
    // disabled however much is on the pasteboard.
    pasteConfiguration = UIPasteConfiguration(acceptableTypeIdentifiers: [
      UTType.image.identifier,
      UTType.png.identifier,
      UTType.jpeg.identifier,
    ])
    addControl()
  }

  private func addControl() {
    // iOS 16 is where UIPasteControl arrives. The podspec keeps the project's
    // own deployment floor rather than raising it for every pod, so the API is
    // guarded here; `available` in index.tsx keeps the view off screen below 16
    // in the first place.
    guard #available(iOS 16.0, *) else { return }
    let configuration = UIPasteControl.Configuration()
    configuration.displayMode = .iconOnly
    configuration.cornerStyle = .capsule
    // The system button follows the trait collection on its own, so it is
    // right in both themes without being told.
    // The configuration is an init argument; the target is a property. Passing
    // both to init is "extra argument 'target' in call" — which is what the
    // first cloud build said, this Swift never having seen a compiler here.
    let control = UIPasteControl(configuration: configuration)
    control.target = self
    control.translatesAutoresizingMaskIntoConstraints = false
    addSubview(control)
    NSLayoutConstraint.activate([
      control.leadingAnchor.constraint(equalTo: leadingAnchor),
      control.trailingAnchor.constraint(equalTo: trailingAnchor),
      control.topAnchor.constraint(equalTo: topAnchor),
      control.bottomAnchor.constraint(equalTo: bottomAnchor),
    ])
    self.control = control
  }

  /// UIKit calls this when the button is tapped and the pasteboard holds
  /// something this view accepts. It is the only path — the app never reads the
  /// pasteboard itself, which is exactly why there is no prompt.
  override func paste(itemProviders: [NSItemProvider]) {
    guard let provider = itemProviders.first(where: { $0.canLoadObject(ofClass: UIImage.self) }) else {
      onPasteError(["reason": "not_an_image"])
      return
    }
    provider.loadObject(ofClass: UIImage.self) { [weak self] object, error in
      guard let self else { return }
      guard let image = object as? UIImage, error == nil else {
        DispatchQueue.main.async { self.onPasteError(["reason": "unreadable"]) }
        return
      }
      guard let data = image.jpegData(compressionQuality: kJpegQuality) else {
        DispatchQueue.main.async { self.onPasteError(["reason": "unreadable"]) }
        return
      }
      // Base64 on a background queue: a screenshot is a megabyte or two and
      // this runs on the provider's callback thread, not the main one.
      let base64 = data.base64EncodedString()
      DispatchQueue.main.async {
        self.onPasteImage([
          "base64": base64,
          "mime": "image/jpeg",
          "width": Int(image.size.width * image.scale),
          "height": Int(image.size.height * image.scale),
        ])
      }
    }
  }

  /// A responder must say yes to `paste:` for the control to enable itself.
  override func canPerformAction(_ action: Selector, withSender sender: Any?) -> Bool {
    if action == #selector(UIResponder.paste(_:)) {
      return UIPasteboard.general.hasImages
    }
    return super.canPerformAction(action, withSender: sender)
  }
}
