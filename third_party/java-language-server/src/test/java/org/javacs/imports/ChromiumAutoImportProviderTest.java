package org.javacs.imports;

import static org.hamcrest.Matchers.*;
import static org.junit.Assert.*;

import com.sun.source.util.Trees;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;
import org.javacs.CompilerProvider;
import org.javacs.LanguageServerFixture;
import org.javacs.lsp.TextEdit;
import org.junit.Test;

public class ChromiumAutoImportProviderTest {
    private static final CompilerProvider compiler = LanguageServerFixture.getCompilerProvider();

    private List<String> addImport(String fileName, String className) {
        var path = LanguageServerFixture.DEFAULT_WORKSPACE_ROOT
                .resolve("src/org/javacs/imports")
                .resolve(fileName)
                .toAbsolutePath();
        var task = compiler.parse(path);
        var edits = ChromiumAutoImportProvider.INSTANCE.addImport(className, task.root, Trees.instance(task.task).getSourcePositions());
        return edits.stream().map(TextEdit::toString).collect(Collectors.toList());
    }

    @Test
    public void noPackage() {
        var edits = addImport("NoPackage.java", "com.example.AutoImportTest3");
        assertThat(edits, hasSize(1));
        var edit = edits.get(0);
        assertThat(edit, equalTo("0,0-0,0/import com.example.AutoImportTest3;\n"));
    }

    @Test
    public void noImport() {
        var edits = addImport("NoImport.java", "com.example.AutoImportTest3");
        assertThat(edits, hasSize(1));
        var edit = edits.get(0);
        assertThat(edit, equalTo("1,0-1,0/\nimport com.example.AutoImportTest3;\n"));
    }

    @Test
    public void singleSectionFirst() {
        var edits = addImport("SingleSection.java", "com.example.AutoImportTest1");
        assertThat(edits, hasSize(1));
        var edit = edits.get(0);
        assertThat(edit, equalTo("2,0-2,0/import com.example.AutoImportTest1;\n"));
    }

    @Test
    public void singleSectionMiddle() {
        var edits = addImport("SingleSection.java", "com.example.AutoImportTest3");
        assertThat(edits, hasSize(1));
        var edit = edits.get(0);
        assertThat(edit, equalTo("3,0-3,0/import com.example.AutoImportTest3;\n"));
    }

    @Test
    public void singleSectionLast() {
        var edits = addImport("SingleSection.java", "com.example.AutoImportTest5");
        assertThat(edits, hasSize(1));
        var edit = edits.get(0);
        assertThat(edit, equalTo("4,0-4,0/import com.example.AutoImportTest5;\n"));
    }

    @Test
    public void multipleSectionsFirst() {
        var edits = addImport("MultipleSections.java", "com.example.AutoImportTest1");
        assertThat(edits, hasSize(1));
        var edit = edits.get(0);
        assertThat(edit, equalTo("2,0-2,0/import com.example.AutoImportTest1;\n"));
    }

    @Test
    public void multipleSectionsMiddle() {
        var edits = addImport("MultipleSections.java", "com.example.AutoImportTest3");
        assertThat(edits, hasSize(1));
        var edit = edits.get(0);
        assertThat(edit, equalTo("3,0-3,0/import com.example.AutoImportTest3;\n"));
    }

    @Test
    public void multipleSectionsLast() {
        var edits = addImport("MultipleSections.java", "com.example.AutoImportTest5");
        assertThat(edits, hasSize(1));
        var edit = edits.get(0);
        assertThat(edit, equalTo("4,0-4,0/import com.example.AutoImportTest5;\n"));
    }

    @Test
    public void newSectionFirst() {
        var edits = addImport("MultipleSections.java", "android.Example");
        assertThat(edits, hasSize(1));
        var edit = edits.get(0);
        assertThat(edit, equalTo("2,0-2,0/import android.Example;\n\n"));
    }

    @Test
    public void newSectionMiddle() {
        var edits = addImport("MultipleSections.java", "dalvik.Example");
        assertThat(edits, hasSize(1));
        var edit = edits.get(0);
        assertThat(edit, equalTo("5,0-5,0/import dalvik.Example;\n\n"));
    }

    @Test
    public void newSectionLast() {
        var edits = addImport("MultipleSections.java", "javax.Example");
        assertThat(edits, hasSize(1));
        var edit = edits.get(0);
        assertThat(edit, equalTo("7,0-7,0/\nimport javax.Example;\n"));
    }

    @Test
    public void ignoreStaticImports() {
        var edits = addImport("StaticImports.java", "android.Example");
        assertThat(edits, hasSize(1));
        var edit = edits.get(0);
        assertThat(edit, equalTo("3,0-3,0/\nimport android.Example;\n"));
    }

    @Test
    public void alreadyImported() {
        var edits = addImport("SingleSection.java", "com.example.AutoImportTest4");
        assertThat(edits, hasSize(0));
    }

    @Test
    public void samePackage() {
        var edits = addImport("MultipleSections.java", "org.javacs.imports.SamePackage");
        assertThat(edits, hasSize(0));
    }

    @Test
    public void childPackage() {
        var edits = addImport("MultipleSections.java", "org.javacs.imports.child.ChildPackage");
        assertThat(edits, hasSize(1));
        var edit = edits.get(0);
        assertThat(edit, equalTo("5,0-5,0/import org.javacs.imports.child.ChildPackage;\n\n"));
    }

    @Test
    public void chromiumStaticImportSeparation() {
        var edits = addImport("ChromiumStaticImports.java", "static org.chromium.base.test.util.UrlUtils.getOriginalNonNativeNtpGurl");
        assertThat(edits, hasSize(1));
        var edit = edits.get(0);
        // Expect insertion after existing imports with a newline (because it's a new section, 1 vs 0)
        // Existing lines are 3 and 4. Package line is 1. Empty line 2.
        // It should insert at line 5 (Import list end).
        // Since existing imports are section 0, and new is section 1, it should PREPEND newline.
        assertThat(edit, equalTo("4,0-4,0/\nimport static org.chromium.base.test.util.UrlUtils.getOriginalNonNativeNtpGurl;\n"));
    }

    @Test
    public void chromiumImportOrdering() {
        var imports = Arrays.asList(
            "android.content.Context",
            "androidx.test.filters.MediumTest",
            "java.util.ArrayList",
            "org.chromium.base.ThreadUtils",
            "org.junit.After",
            "static org.chromium.base.test.util.UrlUtils.getOriginalNonNativeNtpGurl",
            "static org.junit.Assert.assertEquals"
        );
        var sorted = new ArrayList<>(imports);
        sorted.sort(ChromiumAutoImportProvider.INSTANCE.importComparator());

        // Expected order:
        // 1. static org.junit (section 6)
        // 2. static org.chromium (section 7)
        // 3. android. (101)
        // 4. androidx. (102)
        // 5. org.junit. (106)
        // 6. org.chromium. (108)
        // 7. java. (109)
        var expected = Arrays.asList(
            "static org.junit.Assert.assertEquals",
            "static org.chromium.base.test.util.UrlUtils.getOriginalNonNativeNtpGurl",
            "android.content.Context",
            "androidx.test.filters.MediumTest",
            "org.junit.After",
            "org.chromium.base.ThreadUtils",
            "java.util.ArrayList"
        );
        assertThat(sorted, equalTo(expected));
    }
}
