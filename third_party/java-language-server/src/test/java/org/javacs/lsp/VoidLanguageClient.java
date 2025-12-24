package org.javacs.lsp;

import com.google.gson.JsonElement;

public class VoidLanguageClient implements LanguageClient {
    @Override
    public void publishDiagnostics(PublishDiagnosticsParams params) {}

    @Override
    public void showMessage(ShowMessageParams params) {}

    @Override
    public void registerCapability(String method, JsonElement options) {}

    @Override
    public void customNotification(String method, JsonElement params) {}
}
