package org.javacs.rewrite;

import static org.hamcrest.Matchers.*;
import static org.junit.Assert.*;

import java.nio.file.Path;
import org.javacs.CompilerProvider;
import org.javacs.LanguageServerFixture;
import org.junit.Test;

public class RewriteTest {
    static final CompilerProvider compiler = LanguageServerFixture.getCompilerProvider();

    private Path file(String name) {
        return LanguageServerFixture.DEFAULT_WORKSPACE_ROOT
                .resolve("src/org/javacs/rewrite")
                .resolve(name)
                .toAbsolutePath();
    }

    @Test
    public void renameVariable() {
        var file = file("TestRenameVariable.java");
        var edits = new RenameVariable(file, 82, "bar").rewrite(compiler);
        assertThat(edits.keySet(), hasSize(1));
        assertThat(edits, hasKey(file));
    }

    @Test
    public void renameField() {
        var className = "org.javacs.rewrite.TestRenameField";
        var fieldName = "foo";
        var renamer = new RenameField(className, fieldName, "bar");
        var edits = renamer.rewrite(compiler);
        assertThat(edits.keySet(), hasSize(1));
        assertThat(edits, hasKey(file("TestRenameField.java")));
    }

    @Test
    public void renameMethod() {
        var className = "org.javacs.rewrite.TestRenameMethod";
        var methodName = "foo";
        String[] erasedParameterTypes = {};
        var renamer = new RenameMethod(className, methodName, erasedParameterTypes, "bar");
        var edits = renamer.rewrite(compiler);
        assertThat(edits.keySet(), hasSize(1));
        assertThat(edits, hasKey(file("TestRenameMethod.java")));
    }

    @Test
    public void fixImports() {
        var file = file("TestFixImports.java");
        var edits = new AutoFixImports(file).rewrite(compiler);
        assertThat(edits, hasKey(file));
        for (var edit : edits.get(file)) {
            if (edit.newText.contains("java.util.List")) {
                return;
            }
        }
        fail();
    }

    @Test
    public void preserveStaticImport() {
        var file = file("StaticImport.java");
        var edits = new AutoFixImports(file).rewrite(compiler);
        assertThat(edits, hasKey(file));
        for (var edit : edits.get(file)) {
            if (edit.newText.contains("java.util.Arrays.asList")) {
                return;
            }
        }
        fail();
    }

    @Test
    public void importAnnotation() {
        var file = file("ImportAnnotation.java");
        var edits = new AutoFixImports(file).rewrite(compiler);
        assertThat(edits, hasKey(file));
        for (var edit : edits.get(file)) {
            if (edit.newText.contains("java.lang.annotation.Native")) {
                return;
            }
        }
        fail("didn't re-create import java.lang.annotation.Native");
    }

    @Test
    public void importNotFound() {
        var file = file("ImportNotFound.java");
        var edits = new AutoFixImports(file).rewrite(compiler);
        assertThat(edits, hasKey(file));
        for (var edit : edits.get(file)) {
            if (edit.newText.contains("foo.bar.Doh")) {
                return;
            }
        }
        fail("didn't re-create import foo.bar.Doh");
    }

    @Test
    public void dontImportEnum() {
        var file = file("DontImportEnum.java");
        var edits = new AutoFixImports(file).rewrite(compiler);
        assertThat(edits, hasKey(file));
        for (var edit : edits.get(file)) {
            if (edit.newText.contains("READ")) {
                fail();
            }
        }
    }

    @Test
    public void addOverride() {
        var file = file("TestAddOverride.java");
        var edits = new AutoAddOverrides(file).rewrite(compiler);
        assertThat(edits, hasKey(file));
    }

    @Test
    public void packageLessFileWithHeader() {
        var file = file("NoPackageWithHeader.java");
        var edits = new AutoFixImports(file).rewrite(compiler);
        assertThat(edits, hasKey(file));
        for (var edit : edits.get(file)) {
            // It should insert imports after the comment block (License Header).
            // The file starts with:
            // /*
            //  * License Header
            //  */
            //
            // public class NoPackageWithHeader {
            //
            // Lines 1-3 are comments. Line 4 is empty. Line 5 is class decl.
            // Insert should be at line 5 (after empty line, before class) or line 4.
            // My logic inserts before the first type decl. The type decl "NoPackageWithHeader" starts at line 5.
            // So it should insert at line 5.
            // Original text: "public class ...".
            // New text: "import java.util.List;\n\npublic class ..."

            // Check that it contains the import
            if (edit.newText.contains("import java.util.List;")) {
                // Check that it preserves the header (implied by insertion point > 0)
                // Range is (line-1, char-1).
                // Line 5 is index 4.
                if (edit.range.start.line >= 3) {
                    return;
                }
            }
        }
        fail("Expected import insertion after header");
    }
}
