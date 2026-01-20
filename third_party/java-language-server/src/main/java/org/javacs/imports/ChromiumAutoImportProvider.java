package org.javacs.imports;

import com.sun.source.tree.CompilationUnitTree;
import com.sun.source.tree.ImportTree;
import com.sun.source.util.SourcePositions;
import java.util.Comparator;
import java.util.List;
import javax.tools.Diagnostic;
import org.javacs.lsp.Position;
import org.javacs.lsp.Range;
import org.javacs.lsp.TextEdit;

/**
 * The import order for Chromium Java source files.
 *
 * https://chromium.googlesource.com/chromium/src/+/main/styleguide/java/java.md#import-order
 */
public class ChromiumAutoImportProvider implements AutoImportProvider {
    public static final ChromiumAutoImportProvider INSTANCE = new ChromiumAutoImportProvider();

    private final SectionedImportOrderHelper helper = new SectionedImportOrderHelper(ChromiumAutoImportProvider::sectionOf);

    private ChromiumAutoImportProvider() {}

    @Override
    public List<TextEdit> addImport(String className, CompilationUnitTree root, SourcePositions sourcePositions) {
        return helper.addImport(className, root, sourcePositions);
    }

    @Override
    public Comparator<String> importComparator() {
        return (a, b) -> {
            boolean aStatic = a.startsWith("static ");
            boolean bStatic = b.startsWith("static ");
            String aName = aStatic ? a.substring(7) : a;
            String bName = bStatic ? b.substring(7) : b;
            int aSection = sectionOf(aName, aStatic);
            int bSection = sectionOf(bName, bStatic);
            if (aSection != bSection) {
                return Integer.compare(aSection, bSection);
            }

            return a.compareTo(b);
        };
    }

    @Override
    public int getImportSection(String className) {
        boolean isStatic = className.startsWith("static ");
        String name = isStatic ? className.substring(7) : className;
        return sectionOf(name, isStatic);
    }

    private static int sectionOf(String className, boolean isStatic) {
        int rank = getPackageRank(className);
        if (isStatic) {
            return rank;
        }
        return 100 + rank;
    }

    private static int getPackageRank(String className) {
        if (className.startsWith("android.")) return 1;
        if (className.startsWith("androidx.")) return 2;
        if (className.startsWith("com.google.android.apps.chrome.")) return 7;
        if (className.startsWith("com.")) return 3;
        if (className.startsWith("dalvik.")) return 4;
        if (className.startsWith("junit.")) return 5;
        if (className.startsWith("org.chromium.")) return 8;
        if (className.startsWith("org.")) return 6;
        if (className.startsWith("java.")) return 9;
        if (className.startsWith("javax.")) return 10;
        return 99;
    }
}
