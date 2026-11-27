import AppKit
import CoreGraphics
import ScreenCaptureKit
import Darwin

final class Overlay: NSWindow {
    override var canBecomeKey: Bool { true }
}

final class Selection: NSView {
    let snapshot: CGImage
    let frozen: NSImage
    var anchor: NSPoint?
    var tip: NSPoint?
    override var isFlipped: Bool { true }
    override var acceptsFirstResponder: Bool { true }

    init(snapshot: CGImage, size: NSSize) {
        self.snapshot = snapshot
        self.frozen = NSImage(cgImage: snapshot, size: size)
        super.init(frame: NSRect(origin: .zero, size: size))
    }
    required init?(coder: NSCoder) { fatalError("programmatic only") }
    private func rect(_ a: NSPoint, _ b: NSPoint) -> NSRect {
        NSRect(x: min(a.x,b.x), y: min(a.y,b.y), width: abs(a.x-b.x), height: abs(a.y-b.y)).intersection(bounds)
    }
    override func resetCursorRects() { addCursorRect(bounds, cursor: .crosshair) }
    override func draw(_ dirtyRect: NSRect) {
        frozen.draw(in: bounds, from: .zero, operation: .copy, fraction: 1, respectFlipped: true, hints: nil)
        if let a = anchor, let b = tip {
            let selection = rect(a,b)
            NSColor.black.setStroke();NSBezierPath(rect:selection).stroke()
            NSColor.white.setStroke();NSBezierPath(rect:selection.insetBy(dx:1,dy:1)).stroke()
        }
        NSColor.black.setFill(); NSBezierPath(rect:NSRect(x:12,y:12,width:238,height:30)).fill()
        ("拖动选择区域   ·   Esc 取消" as NSString).draw(at:NSPoint(x:22,y:17),withAttributes:[.foregroundColor:NSColor.white,.font:NSFont.systemFont(ofSize:14)])
    }
    override func mouseDown(with e:NSEvent) {anchor=convert(e.locationInWindow,from:nil);tip=anchor;needsDisplay=true}
    override func mouseDragged(with e:NSEvent) {tip=convert(e.locationInWindow,from:nil);needsDisplay=true}
    override func mouseUp(with e:NSEvent) {
        guard let a = anchor else {return}
        let r=rect(a,convert(e.locationInWindow,from:nil));anchor=nil;tip=nil
        guard !r.isEmpty else {needsDisplay=true;return}
        let sx=CGFloat(snapshot.width)/bounds.width, sy=CGFloat(snapshot.height)/bounds.height
        let x=round(r.minX*sx),y=round(r.minY*sy)
        let box=CGRect(x:x,y:y,width:round(r.maxX*sx)-x,height:round(r.maxY*sy)-y)
        guard let crop=snapshot.cropping(to:box),let data=NSBitmapImageRep(cgImage:crop).representation(using:.png,properties:[:]) else {exit(2)}
        NSPasteboard.general.clearContents();exit(NSPasteboard.general.setData(data,forType:.png) ? 0 : 2)
    }
    override func keyDown(with e:NSEvent) {if e.keyCode==53 {exit(1)}}
}

@main struct Capture {
    @MainActor static var window: Overlay?
    @MainActor static func main() {
        let app=NSApplication.shared
        app.setActivationPolicy(.accessory)
        Task { @MainActor in
            do {
                guard CGPreflightScreenCaptureAccess() || CGRequestScreenCaptureAccess() else {exit(2)}
                let mouse=NSEvent.mouseLocation
                guard let screen=NSScreen.screens.first(where:{$0.frame.contains(mouse)}),
                      let id=screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber else {exit(2)}
                let content=try await SCShareableContent.excludingDesktopWindows(false,onScreenWindowsOnly:true)
                guard let display=content.displays.first(where:{$0.displayID==id.uint32Value}) else {exit(2)}
                let filter=SCContentFilter(display:display,excludingWindows:[])
                let cfg=SCStreamConfiguration()
                cfg.width=Int((screen.frame.width*screen.backingScaleFactor).rounded())
                cfg.height=Int((screen.frame.height*screen.backingScaleFactor).rounded())
                cfg.showsCursor=false
                let snapshot=try await SCScreenshotManager.captureImage(contentFilter:filter,configuration:cfg)
                let panel=Overlay(contentRect:screen.frame,styleMask:.borderless,backing:.buffered,defer:false)
                panel.level = .screenSaver;panel.isOpaque=true;panel.hasShadow=false
                panel.collectionBehavior=[.canJoinAllSpaces,.fullScreenAuxiliary]
                let view=Selection(snapshot:snapshot,size:screen.frame.size)
                panel.contentView=view;panel.title="wSearch Trial Capture"
                window=panel;app.activate(ignoringOtherApps:true);panel.makeKeyAndOrderFront(nil);panel.makeFirstResponder(view)
            } catch {fputs("ScreenCaptureKit: \(error)\n",stderr);exit(2)}
        }
        app.run()
    }
}

