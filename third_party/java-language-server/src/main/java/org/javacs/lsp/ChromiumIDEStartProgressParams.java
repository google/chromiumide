package org.javacs.lsp;

public class ChromiumIDEStartProgressParams {
    public String id;
    public String message;

    public ChromiumIDEStartProgressParams() {}

    public ChromiumIDEStartProgressParams(String id, String message) {
        this.id = id;
        this.message = message;
    }
}
