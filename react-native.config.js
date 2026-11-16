module.exports = {
  dependency: {
    platforms: {
      android: { sourceDir: './android', packageImportPath: 'import com.quralingo.recitation.RecitationPackage;', packageInstance: 'new RecitationPackage()' },
      ios: { podspecPath: './QuralingoRecitation.podspec' },
    },
  },
};
