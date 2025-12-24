package org.chromium.chrome;

import org.chromium.content.Tab;

public class Browser {
    public Browser() {}

    public void run() {
        Tab tab = new Tab();
        tab.navigateToDino(); // This method is deprecated
    }
}
