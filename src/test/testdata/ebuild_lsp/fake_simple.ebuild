
EAPI=7
inherit multilib-minimal arc-build-constants

DESCRIPTION="Ebuild for per-sysroot arc-build components."

LICENSE="BSD-Google"
SLOT="0"
KEYWORDS="*"

RDEPEND=""
DEPEND=""

S=${WORKDIR}

src_compile() {
  arc-build-constants-configure
}

install_pc_file() {
  prefix="${ARC_PREFIX}/usr"
  sed \
    -e "s|@lib@|$(get_libdir)|g" \
    -e "s|@prefix@|\${prefix}|g" \
    "${PC_SRC_DIR}"/"$1" > "$1" || die
  doins "$1"
}
