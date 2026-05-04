class VaultsDiagramTools < Formula
  desc "Mermaid and source-code diagram generation tools"
  homepage "https://github.com/malnati/vaults-diagram-tools"
  url "https://github.com/malnati/vaults-diagram-tools/releases/download/vVERSION/vaults-diagram-tools-VERSION.zip"
  sha256 "SHA256"
  license "MIT"

  depends_on "node@20"

  def install
    libexec.install Dir["*"]
    bin.install_symlink libexec/"packages/renderer/render-mermaid-assets.mjs" => "vaults-mermaid-render"
    bin.install_symlink libexec/"packages/source-diagrams/source-diagrams.mjs" => "vaults-source-diagrams"
    bin.install_symlink libexec/"packages/mcp/server.mjs" => "vaults-diagram-mcp"
  end

  test do
    (testpath/"diagram.mmd").write "flowchart TD\n  A --> B\n"
    system bin/"vaults-mermaid-render", testpath/"diagram.mmd"
    assert_path_exists testpath/"diagram.svg"
    assert_path_exists testpath/"diagram.jpg"
  end
end
